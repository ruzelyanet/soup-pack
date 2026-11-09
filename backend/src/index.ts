import type { Core } from '@strapi/strapi'
import { sendTelegram, escapeHtml } from './utils/telegram'
import { getRealtimeBus, type RequestSummary } from './utils/realtime'
import { syncShopBot, stopShopBot } from './bot'

const PUBLIC_ACTIONS: Array<{ api: string; actions: string[] }> = [
    { api: 'api::category.category',   actions: ['find', 'findOne'] },
    { api: 'api::product.product',     actions: ['find', 'findOne'] },
    { api: 'api::banner.banner',       actions: ['find', 'findOne'] },
    { api: 'api::order-set.order-set', actions: ['find', 'findOne'] },
    { api: 'api::home-section.home-section', actions: ['find', 'findOne'] },
    { api: 'api::order.order',         actions: ['place', 'mine'] },
    { api: 'api::client.client',       actions: ['signIn', 'updateMe'] },
    { api: 'api::request-form.request-form', actions: ['getPublic', 'submit'] },
]

/** Разово нотифицировать Telegram о просроченных неназначенных заявках.
 *  Проверяется каждую минуту; флаг `extra.overdueNotifiedAt` защищает от повторов. */
async function scanOverdueRequests(strapi: Core.Strapi) {
    try {
        const settings = await strapi.db
            .query('api::request-setting.request-setting')
            .findOne({ where: {} })
        if (!settings?.overdueCheckEnabled) return

        const redMs = Math.max(1, Number(settings.redAfterMin || 30)) * 60_000
        const threshold = new Date(Date.now() - redMs)
        const tgReady = !!(settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatIds)

        const rows = await strapi.db.query('api::request.request').findMany({
            where: {
                acceptedById: { $null: true },
                archived: false,
                outcome: 'open',
                createdAt: { $lt: threshold },
            } as any,
            select: ['id', 'code', 'type', 'name', 'phone', 'source', 'sourceDetail', 'createdAt', 'extra'],
            limit: 100,
        })

        for (const r of rows) {
            const extra = (r.extra || {}) as Record<string, any>
            if (extra.overdueNotifiedAt) continue

            if (tgReady) {
                const waitMin = Math.round((Date.now() - new Date(r.createdAt).getTime()) / 60_000)
                const typeLabel = r.type === 'shop' ? 'Магазин' : 'Физлицо'
                const text =
                    `⚠ <b>Просрочена ${escapeHtml(r.code)}</b>\n` +
                    `${escapeHtml(typeLabel)} · ждёт ${waitMin} мин\n` +
                    `${escapeHtml(r.name)} · ${escapeHtml(r.phone)}`
                await sendTelegram(settings.telegramBotToken, settings.telegramChatIds, text, strapi.log)
            }

            await strapi.db.query('api::request.request').update({
                where: { id: r.id },
                data: { extra: { ...extra, overdueNotifiedAt: new Date().toISOString() } },
            })

            try {
                const summary: RequestSummary = {
                    id: r.id, code: r.code, type: r.type, name: r.name,
                    source: r.source, sourceDetail: (r as any).sourceDetail ?? null,
                    createdAt: new Date(r.createdAt).toISOString(),
                }
                getRealtimeBus().publish({ scope: 'requests', type: 'request.overdue', requestId: r.id, summary })
            } catch (e: any) {
                strapi.log.warn('[realtime.publish] ' + (e?.message || e))
            }
        }
    } catch (e: any) {
        strapi.log.error('[scanOverdueRequests] ' + (e?.message || e))
    }
}

async function ensureAdminEmployee(strapi: Core.Strapi) {
    const count = await strapi.db.query('api::employee.employee').count({})
    if (count > 0) return

    const phone = '+998901234567'
    const personalKey = 'admin12345'
    await strapi.db.query('api::employee.employee').create({
        data: {
            fullName: 'Admin',
            phone,
            role: 'manager',
            // lifecycle автоматически захэширует ключ.
            personalKey,
            publishedAt: new Date(),
        },
    })
    strapi.log.info('==============================================================')
    strapi.log.info('[bootstrap] создан дефолтный сотрудник-manager:')
    strapi.log.info(`[bootstrap]   phone:       ${phone}`)
    strapi.log.info(`[bootstrap]   personalKey: ${personalKey}`)
    strapi.log.info('[bootstrap] смените ключ в админке и/или удалите эту запись.')
    strapi.log.info('==============================================================')
}

async function ensureRequestColumns(strapi: Core.Strapi) {
    const existing = await strapi.db.query('api::request-column.request-column').findMany({
        orderBy: { position: 'asc' as const },
        limit: 100,
    })
    const hasNew  = existing.some((c: any) => c.kind === 'new')
    const hasDone = existing.some((c: any) => c.kind === 'done')
    if (!hasNew) {
        await strapi.db.query('api::request-column.request-column').create({
            data: {
                name: 'Новые заявки',
                color: '#D63A1C',
                kind: 'new',
                position: 1,
                publishedAt: new Date(),
            },
        })
        strapi.log.info('[bootstrap] created column: new')
    }
    if (!hasDone) {
        const lastPos = existing.reduce((m: number, c: any) => Math.max(m, c.position ?? 0), 0)
        await strapi.db.query('api::request-column.request-column').create({
            data: {
                name: 'Готово',
                color: '#1F3D14',
                kind: 'done',
                position: Math.max(1_000_000, lastPos + 1),
                publishedAt: new Date(),
            },
        })
        strapi.log.info('[bootstrap] created column: done')
    }
}

async function grantPublicPermissions(strapi: Core.Strapi) {
    const role = await strapi.db
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: 'public' } })
    if (!role) {
        strapi.log.warn('[bootstrap] public role not found; skipping perms')
        return
    }

    for (const { api, actions } of PUBLIC_ACTIONS) {
        for (const action of actions) {
            const actionId = `${api}.${action}`
            const exists = await strapi.db
                .query('plugin::users-permissions.permission')
                .findOne({ where: { role: role.id, action: actionId } })
            if (!exists) {
                await strapi.db
                    .query('plugin::users-permissions.permission')
                    .create({ data: { role: role.id, action: actionId } })
                strapi.log.info(`[bootstrap] granted public: ${actionId}`)
            }
        }
    }
}

/** findOne + create по полю. Создаём как draft через documents API, потом публикуем,
 *  чтобы было две версии (draft + published) — иначе documents.create для связанных сущностей
 *  не находит продукт при коннекте по documentId. */
async function upsertByField<T extends { id: number; documentId: string }>(
    strapi: Core.Strapi,
    uid: string,
    field: string,
    value: unknown,
    data: Record<string, any>,
    withPublishedAt = true,
): Promise<T> {
    const existing = await strapi.db
        .query(uid as any)
        .findOne({ where: { [field]: value } })
    if (existing) return existing as T
    const created = await strapi.documents(uid as any).create({
        data: data as any,
    } as any)
    if (withPublishedAt) {
        await strapi.documents(uid as any).publish({ documentId: (created as any).documentId } as any)
    }
    return created as T
}

async function seedCatalog(strapi: Core.Strapi) {
    strapi.log.info('[seed] ensuring catalog is populated (idempotent)…')

    // Categories
    const catsData = [
        { name: 'Супы',    slug: 'soups',  sort: 1 },
        { name: 'Паста',   slug: 'pasta',  sort: 2 },
        { name: 'Напитки', slug: 'drinks', sort: 3 },
    ]
    const cats: Record<string, { id: number }> = {}
    for (const c of catsData) {
        cats[c.slug] = await upsertByField(strapi, 'api::category.category', 'slug', c.slug, c)
    }

    // `composition` в схеме = json → в Postgres должен быть массив, не строка.
    const comp = (s: string) => s.split(/,\s*/).map((x) => x.replace(/\.$/, '')).filter(Boolean)

    // 10 products
    const products = [
        { name: 'Том-ям', slug: 'tom-yam',
          description: 'Тайский острый суп с креветками, грибами и кокосовым молоком.',
          composition: comp('Креветки, грибы, кокосовое молоко, лемонграсс, галангал, чили, кинза'),
          weight: 350, price: 55000,
          available: true, tags: ['острый', 'хит'], category: cats['soups'].id },
        { name: 'Куриный с лапшой', slug: 'chicken-noodle',
          description: 'Домашний куриный бульон с лапшой и овощами.',
          composition: comp('Курица, лапша, морковь, лук, зелень, специи'),
          weight: 350, price: 42000, available: true, category: cats['soups'].id },
        { name: 'Крем-суп тыквенный', slug: 'pumpkin-cream',
          description: 'Нежный крем-суп из тыквы со сливками.',
          composition: comp('Тыква, сливки, лук, чеснок, тимьян'),
          weight: 350, price: 40000, available: true, tags: ['вегетарианское'],
          category: cats['soups'].id },
        { name: 'Чечевичный', slug: 'lentil',
          description: 'Сытный суп из красной чечевицы с восточными специями.',
          composition: comp('Красная чечевица, лук, морковь, зира, чеснок'),
          weight: 350, price: 38000, available: true, category: cats['soups'].id },
        { name: 'Борщ украинский', slug: 'borsch',
          description: 'Классический борщ со свёклой, говядиной и сметаной.',
          composition: comp('Свёкла, капуста, картофель, говядина, лук, морковь, томаты, укроп, сметана'),
          weight: 350, price: 46000, available: true, tags: ['хит'], category: cats['soups'].id },
        { name: 'Харчо грузинский', slug: 'kharcho',
          description: 'Пряный грузинский суп с говядиной, рисом и ткемали.',
          composition: comp('Говядина, рис, томаты, грецкий орех, хмели-сунели, ткемали, кинза'),
          weight: 350, price: 52000, available: true, tags: ['острый'], category: cats['soups'].id },
        { name: 'Минестроне', slug: 'minestrone',
          description: 'Итальянский овощной суп с пастой и фасолью.',
          composition: comp('Фасоль, цукини, морковь, томаты, паста, пармезан, базилик'),
          weight: 350, price: 44000, available: true, tags: ['вегетарианское'], category: cats['soups'].id },
        { name: 'Крем-суп грибной', slug: 'mushroom-cream',
          description: 'Насыщенный крем-суп с шампиньонами и трюфельным маслом.',
          composition: comp('Шампиньоны, сливки, лук, чеснок, тимьян, трюфельное масло'),
          weight: 350, price: 48000,
          available: true, tags: ['вегетарианское'], category: cats['soups'].id },
        { name: 'Спагетти с соусом', slug: 'spaghetti',
          description: 'Паста с томатным соусом, мясом и специями.',
          composition: comp('Спагетти, говяжий фарш, томаты, базилик, чеснок'),
          weight: 350, price: 48000, available: true, category: cats['pasta'].id },
        { name: 'Кола 0.5', slug: 'cola',
          description: 'Классическая кола, 0.5 л.',
          weight: 500, price: 12000, available: true, category: cats['drinks'].id },
    ]
    const productDocIdBySlug: Record<string, string> = {}
    for (const p of products) {
        const row = await upsertByField<{ id: number; documentId: string }>(
            strapi, 'api::product.product', 'slug', p.slug, p,
        )
        productDocIdBySlug[p.slug] = row.documentId
    }
    strapi.log.info(`[seed] products: ${Object.keys(productDocIdBySlug).length}`)

    // Order set — создаём только если нет. В Strapi 5 для relation внутри компонента
    // через documents API ожидается documentId строкой.
    const existingSet = await strapi.db
        .query('api::order-set.order-set')
        .findOne({ where: { slug: 'weekly-3' } })
    if (!existingSet) {
        const created = await strapi.documents('api::order-set.order-set').create({
            data: {
                name: 'Неделька · 3 человека',
                slug: 'weekly-3',
                description: '3 том-яма, 2 пасты и кола — выгодно и удобно на несколько дней.',
                showInCatalog: true,
                items: [
                    { product: productDocIdBySlug['tom-yam'],   qty: 3 },
                    { product: productDocIdBySlug['spaghetti'], qty: 2 },
                    { product: productDocIdBySlug['cola'],      qty: 1 },
                ],
            } as any,
        })
        await strapi.documents('api::order-set.order-set').publish({ documentId: (created as any).documentId } as any)
        strapi.log.info('[seed] order-set created')
    }

    // Banners
    const banners = [
        { title: 'Твой вкусный момент', subtitle: 'Натуральные супы в формате шайбы 350 г', linkUrl: '/catalog', sort: 1 },
        { title: 'Готовые наборы',      subtitle: 'Выгоднее, чем по одному',               linkUrl: '/set/weekly-3', sort: 2 },
    ]
    for (const b of banners) {
        await upsertByField(strapi, 'api::banner.banner', 'title', b.title, { ...b, active: true })
    }

    // Home sections: 1 «Наборы» + 3 по категориям + 1 «Хиты». Идемпотентно по title.
    const existingHs = await strapi.db.query('api::home-section.home-section').findMany({ limit: 500 })
    const hsByTitle = new Map<string, any>(existingHs.map((h: any) => [h.title, h]))
    const allProducts = await strapi.db.query('api::product.product').findMany({
        populate: ['category'],
        limit: 500,
    })
    const defaults: Array<{
        title: string; icon: string; sort: number
        categorySlug?: string; isHits?: boolean; isSets?: boolean
    }> = [
        { title: 'Наборы',  icon: 'bag',      isSets: true,            sort: 1 },
        { title: 'Супы',    icon: 'catalog',  categorySlug: 'soups',   sort: 2 },
        { title: 'Паста',   icon: 'leaf',     categorySlug: 'pasta',   sort: 3 },
        { title: 'Напитки', icon: 'snow',     categorySlug: 'drinks',  sort: 4 },
        { title: 'Хиты',    icon: 'sparkles', isHits: true,            sort: 5 },
    ]
    for (const d of defaults) {
        if (hsByTitle.has(d.title)) continue
        const category = d.categorySlug ? cats[d.categorySlug] : null
        const products = d.isHits || d.isSets
            ? []
            : allProducts.filter((p: any) => p.category?.slug === d.categorySlug).map((p: any) => p.id)
        const created = await strapi.documents('api::home-section.home-section' as any).create({
            data: {
                title: d.title,
                icon: d.icon,
                sort: d.sort,
                visible: true,
                isHits: !!d.isHits,
                isSets: !!d.isSets,
                category: category?.id ?? null,
                products,
            },
        } as any)
        await strapi.documents('api::home-section.home-section' as any).publish({
            documentId: (created as any).documentId,
        } as any)
        strapi.log.info(`[seed] home-section: ${d.title}`)
    }

    strapi.log.info('[seed] done')
}

export default {
    register() {},
    async bootstrap({ strapi }: { strapi: Core.Strapi }) {
        await grantPublicPermissions(strapi)
        try {
            await ensureRequestColumns(strapi)
        } catch (e: any) {
            strapi.log.error('[bootstrap] columns FAILED: ' + (e?.message || e))
            strapi.log.error(e?.stack || '')
        }
        try {
            await ensureAdminEmployee(strapi)
        } catch (e: any) {
            strapi.log.error('[bootstrap] admin FAILED: ' + (e?.message || e))
            strapi.log.error(e?.stack || '')
        }
        try {
            await seedCatalog(strapi)
        } catch (e: any) {
            strapi.log.error('[seed] FAILED: ' + (e?.message || e))
            strapi.log.error(e?.stack || '')
        }
        try {
            // Разово переносит `product.price` в отдельные строки `price`. Флаг — в strapi.store.
            await strapi.service('api::price.pricing').migratePricingV1()
        } catch (e: any) {
            strapi.log.error('[pricing] migration v1 FAILED: ' + (e?.message || e))
            strapi.log.error(e?.stack || '')
        }

        // Планировщик просроченных заявок (каждую минуту; настройки читаются внутри).
        const overdueTimer = setInterval(() => { scanOverdueRequests(strapi) }, 60_000)
        strapi.server.httpServer.on('close', () => clearInterval(overdueTimer))

        // Магазинный Telegram-бот (long polling). Токен и включение — в админке «SLA и Telegram»,
        // см. docs/telegram-bot.md. Не ждём: запуск не должен задерживать старт сервера.
        syncShopBot(strapi)
        strapi.server.httpServer.on('close', () => { stopShopBot() })
    },
}
