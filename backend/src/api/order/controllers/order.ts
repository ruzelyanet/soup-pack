import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import type { BuildOrderInput } from '../services/order'
import { GeocoderError, geocoderConfigured, resolveOrderDistrict } from '../../../utils/district'

const { ApplicationError } = errors

/** Поля, которые меняет только расчёт (edit). Через обычный PUT — запрещены. */
const MONEY_FIELDS = [
    'items', 'subtotal', 'total', 'discountTotal', 'cartDiscountPercent', 'cartDiscountAmount',
    'paidAmount', 'paymentStatus',
]
/** Данные заказа, которые можно менять только до подтверждения клиентом (status = new). */
const EDITABLE_FIELDS = [
    'client', 'address', 'lat', 'lng', 'deliveryMethod', 'deliverySlotAt', 'paymentMethod', 'comment',
]

function normalizePhone(input: string): string {
    const digits = (input || '').replace(/\D/g, '').slice(-9)
    return '+998' + digits
}

/** Период статистики из query: ISO-время (админка шлёт границы суток в своём поясе)
 *  или YYYY-MM-DD (= сутки по Ташкенту). `all=1` — всё время. Без параметров — последние 7 дней. */
function parsePeriod(query: any): { from: Date; to: Date; allTime: boolean } {
    const q = (query || {}) as { from?: string; to?: string; all?: string }
    const TZ = '+05:00' // Asia/Tashkent, без перехода на летнее время
    const parse = (v: string | undefined, endOfDay: boolean): Date | null => {
        if (!v) return null
        const d = /^\d{4}-\d{2}-\d{2}$/.test(v)
            ? new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}${TZ}`)
            : new Date(v)
        return Number.isNaN(d.getTime()) ? null : d
    }
    const allTime = q.all === '1' || q.all === 'true'
    const to = (!allTime && parse(q.to, true)) || new Date()
    const from = allTime ? new Date(0) : (parse(q.from, false) || new Date(to.getTime() - 7 * 86400_000))
    return { from, to, allTime }
}

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
    /** Публичное оформление из каталога — через общий сервис. */
    async place(ctx) {
        try {
            const body = (ctx.request.body?.data || ctx.request.body) as any

            // Валидация полей формы — пофайловые сообщения,
            // которые фронт рисует под соответствующими инпутами.
            const fieldErrors: Record<string, string> = {}
            const fullName = String(body?.client?.fullName || '').trim()
            const phoneRaw = String(body?.client?.phone || '').trim()
            const address  = String(body?.client?.address || body?.address || '').trim()

            if (!fullName) fieldErrors.fullName = 'Укажите имя'
            if (!phoneRaw) {
                fieldErrors.phone = 'Укажите номер телефона'
            } else {
                const normalized = normalizePhone(phoneRaw)
                if (normalized.length !== 13 || !/^\+998\d{9}$/.test(normalized)) {
                    fieldErrors.phone = 'Неверный формат номера'
                }
            }
            if (!address) fieldErrors.address = 'Укажите адрес доставки'
            if (!Array.isArray(body?.items) || !body.items.length) {
                fieldErrors.items = 'Корзина пуста'
            }

            if (Object.keys(fieldErrors).length) {
                return ctx.badRequest('Проверьте форму заказа', { fieldErrors })
            }

            // Способ доставки, выбранный клиентом (коллекция delivery-method, напр. `yandex`).
            // Принимаем только существующий и активный — иначе заказ без кода, как раньше.
            let deliveryMethodCode: string | null = null
            const requestedCode = typeof body.deliveryMethodCode === 'string' ? body.deliveryMethodCode.trim() : ''
            if (requestedCode) {
                const method = await strapi.db.query('api::delivery-method.delivery-method').findOne({
                    where: { code: requestedCode },
                })
                if (method && method.active !== false) deliveryMethodCode = requestedCode
            }

            const input: BuildOrderInput = {
                client: {
                    fullName: body.client.fullName,
                    phone: body.client.phone,
                    address: body.client.address,
                    lat: body.client.lat,
                    lng: body.client.lng,
                },
                items: body.items,
                paymentMethod: body.paymentMethod,
                deliveryMethod: body.deliveryMethod === 'preorder' ? 'preorder' : 'courier_now',
                deliveryMethodCode,
                deliverySlotAt: body.deliverySlotAt ?? null,
                comment: body.comment,
                address: body.address ?? body.client.address,
                lat: body.lat ?? body.client.lat,
                lng: body.lng ?? body.client.lng,
            }

            const created = await strapi.service('api::order.order').buildAndCreate(input, {
                source: 'catalog',
            })
            ctx.body = { data: created }
        } catch (err: any) {
            if (err instanceof ApplicationError) {
                return ctx.badRequest(err.message, err.details || {})
            }
            strapi.log.error('[orders/place] ' + (err?.message || err))
            strapi.log.error(err?.stack || '')
            return ctx.internalServerError(err?.message || 'order create failed', {
                detail: err?.details || err?.message,
            })
        }
    },

    /** Публичная: заказы по телефону. */
    async mine(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as { phone?: string }
        if (!body?.phone) return ctx.badRequest('phone is required')
        const phone = normalizePhone(body.phone)
        if (phone.length !== 13) return ctx.badRequest('invalid phone')
        const rows = await strapi.documents('api::order.order').findMany({
            filters: { client: { phone: { $eq: phone } } } as any,
            // Явно просим все поля компонента items (basePrice/unitPrice/setInstance/discounts/…)
            // вместе с relation product. Для component в Strapi 5 нужен объектный populate.
            populate: {
                client: true,
                items: { populate: ['product'] },
            } as any,
            sort: ['createdAt:desc'] as any,
            limit: 100,
        } as any)
        ctx.body = { data: rows }
    },

    /** Расчёт без сохранения (staff). */
    async preview(ctx) {
        try {
            const body = (ctx.request.body?.data || ctx.request.body) as any
            if (!Array.isArray(body?.items) || !body.items.length) {
                return ctx.badRequest('items are required')
            }
            const result = await strapi.service('api::order.order').preview(body)
            ctx.body = { data: result }
        } catch (err: any) {
            if (err instanceof ApplicationError) return ctx.badRequest(err.message)
            strapi.log.error('[orders/preview] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'preview failed')
        }
    },

    /** Сводные метрики для дашборда. */
    /** Заказы за период для карты / статистики по районам: только поля для геоаналитики. */
    async geo(ctx) {
        const employee = ctx.state.employee
        if (!employee || !['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')
        const { from, to, allTime } = parsePeriod(ctx.query)
        if (from > to) return ctx.badRequest('from must be before to')
        const withCanceled = ctx.query?.canceled === '1'
        const where: any = { createdAt: { $gte: from, $lte: to } }
        if (!withCanceled) where.status = { $ne: 'canceled' }
        const rows = await strapi.db.query('api::order.order').findMany({
            where,
            select: ['id', 'documentId', 'code', 'status', 'total', 'lat', 'lng', 'address', 'district', 'createdAt', 'deliveryMethodCode'],
            orderBy: { createdAt: 'desc' },
            limit: 20000,
        })
        ctx.body = {
            data: rows.map((o: any) => ({
                id: o.id,
                documentId: o.documentId,
                code: o.code,
                status: o.status,
                total: Number(o.total || 0),
                lat: o.lat != null ? Number(o.lat) : null,
                lng: o.lng != null ? Number(o.lng) : null,
                address: o.address || null,
                // null — ещё не определяли; '' — определяли, района нет.
                district: o.district ?? null,
                createdAt: o.createdAt,
                deliveryMethodCode: o.deliveryMethodCode || null,
            })),
            meta: {
                from: from.toISOString(), to: to.toISOString(), allTime, truncated: rows.length >= 20000,
                unresolved: rows.filter((o: any) => o.district == null && (o.lat != null || o.address)).length,
                geocoder: geocoderConfigured(),
            },
        }
    },

    /** Дозаполнить район у заказов, где он ещё не определён (старые заказы). Порция за вызов — админка вызывает,
     *  пока `left > 0`. Между запросами к геокодеру пауза, чтобы не упереться в лимиты Яндекса. */
    async resolveDistricts(ctx) {
        const employee = ctx.state.employee
        if (!employee || !['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')
        const batch = Math.min(50, Math.max(1, Number(ctx.request.body?.batch) || 25))
        const where: any = { district: { $null: true }, $or: [{ lat: { $notNull: true } }, { address: { $notNull: true } }] }
        const rows = await strapi.db.query('api::order.order').findMany({
            where, select: ['id', 'address', 'lat', 'lng'], orderBy: { createdAt: 'desc' }, limit: batch,
        })
        let resolved = 0
        let error: string | null = null
        for (const o of rows as any[]) {
            try {
                const district = await resolveOrderDistrict(o)
                await strapi.db.query('api::order.order').update({ where: { id: o.id }, data: { district } })
                if (district) resolved++
            } catch (e: any) {
                error = e instanceof GeocoderError ? e.message : (e?.message || String(e))
                break // ключ / сеть — дальше нет смысла
            }
            await new Promise((r) => setTimeout(r, 120))
        }
        const left = await strapi.db.query('api::order.order').count({ where })
        ctx.body = { data: { processed: rows.length, resolved, left, error, geocoder: geocoderConfigured() } }
    },

    async dashboard(ctx) {
        const employee = ctx.state.employee
        if (!employee || !['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')

        const { from, to, allTime } = parsePeriod(ctx.query)
        if (from > to) return ctx.badRequest('from must be before to')
        // Предыдущий период той же длины — для сравнения («+12% к прошлому периоду»).
        const span = to.getTime() - from.getTime()
        const prevTo = new Date(from.getTime() - 1)
        const prevFrom = new Date(from.getTime() - span - 1)
        // --- Неназначенные заявки (всего, не только за период) ---
        const unassignedRequestsCount = await strapi.db.query('api::request.request').count({
            where: { acceptedById: { $null: true }, archived: false, outcome: 'open' },
        })

        // --- avg time-to-accept (минут) за период по принятым ---
        const accepted = await strapi.db.query('api::request.request').findMany({
            where: {
                acceptedAt: { $gte: from, $lte: to },
            } as any,
            select: ['id', 'createdAt', 'acceptedAt'],
            limit: 5000,
        })
        let totalWait = 0
        let waitCount = 0
        for (const r of accepted) {
            if (!r.createdAt || !r.acceptedAt) continue
            const diff = new Date(r.acceptedAt).getTime() - new Date(r.createdAt).getTime()
            if (diff > 0) { totalWait += diff; waitCount++ }
        }
        const avgTimeToAcceptMinutes = waitCount ? Math.round(totalWait / waitCount / 60000) : 0

        // --- Конверсия по типам за период ---
        const periodRequests = await strapi.db.query('api::request.request').findMany({
            where: { createdAt: { $gte: from, $lte: to } } as any,
            populate: ['assignee'],
            select: ['id', 'outcome', 'createdAt'],
            limit: 10000,
        })
        const byEmployeeAcc: Record<string, { id: number; name: string; requests: number; converted: number; rate: number }> = {}

        for (const r of periodRequests) {
            const emp = (r as any).assignee
            if (emp?.id) {
                const key = String(emp.id)
                byEmployeeAcc[key] = byEmployeeAcc[key] || { id: emp.id, name: emp.fullName || `#${emp.id}`, requests: 0, converted: 0, rate: 0 }
                byEmployeeAcc[key].requests += 1
                if (r.outcome === 'converted') byEmployeeAcc[key].converted += 1
            }
        }
        const conversionByEmployee = Object.values(byEmployeeAcc).map((b) => ({
            ...b,
            rate: b.requests ? Math.round((b.converted / b.requests) * 100) : 0,
        }))

        // --- Продажи, отмены, поступления: за период и за предыдущий такой же ---
        const salesFor = async (a: Date, b: Date) => {
            const rows = await strapi.db.query('api::order.order').findMany({
                where: { createdAt: { $gte: a, $lte: b }, status: { $ne: 'canceled' } } as any,
                select: ['total'],
                limit: 100000,
            })
            const ordersCount = rows.length
            const salesTotal = rows.reduce((s: number, o: any) => s + Number(o.total || 0), 0)
            const canceledCount = await strapi.db.query('api::order.order').count({
                where: { createdAt: { $gte: a, $lte: b }, status: 'canceled' } as any,
            })
            const txns = await strapi.db.query('api::transaction.transaction').findMany({
                where: { status: 'completed', paidAt: { $gte: a, $lte: b } } as any,
                select: ['kind', 'amount'],
                limit: 100000,
            })
            let paymentsSum = 0
            let refundsSum = 0
            for (const t of txns) {
                const amt = Number(t.amount || 0)
                if (t.kind === 'payment') paymentsSum += amt
                else if (t.kind === 'refund') refundsSum += amt
            }
            const newClientsCount = await strapi.db.query('api::client.client').count({
                where: { createdAt: { $gte: a, $lte: b } } as any,
            })
            return {
                ordersCount,
                salesTotal,
                avgCheck: ordersCount > 0 ? Math.round(salesTotal / ordersCount) : 0,
                canceledCount,
                paymentsSum,
                refundsSum,
                receiptsTotal: paymentsSum - refundsSum,
                newClientsCount,
            }
        }
        const current = await salesFor(from, to)
        const previous = allTime ? null : await salesFor(prevFrom, prevTo)

        // --- Хиты продаж за период (по строкам заказов, без отменённых) ---
        const periodOrders = await strapi.db.query('api::order.order').findMany({
            where: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'canceled' } } as any,
            select: ['id'],
            populate: { items: { populate: { product: { select: ['id', 'name', 'slug'] } } } } as any,
            limit: 100000,
        })
        const topAcc = new Map<string, { productId: number | null; name: string; sold: number; revenue: number }>()
        for (const o of periodOrders as any[]) {
            for (const it of o.items || []) {
                const pid = it.product?.id ?? null
                const key = pid ? `p${pid}` : `n${it.name}`
                const row = topAcc.get(key) ?? { productId: pid, name: it.product?.name || it.name, sold: 0, revenue: 0 }
                const qty = Number(it.qty || 0)
                row.sold += qty
                row.revenue += it.lineTotal != null ? Number(it.lineTotal) : Number(it.price || 0) * qty
                topAcc.set(key, row)
            }
        }
        const topProducts = [...topAcc.values()].sort((a, b) => b.sold - a.sold || b.revenue - a.revenue).slice(0, 5)

        // --- Состояние «сейчас» (не зависит от периода) ---
        const clientsCount = await strapi.db.query('api::client.client').count({})
        const productsCount = await strapi.db.query('api::product.product').count({})
        const activeOrdersCount = await strapi.db.query('api::order.order').count({
            where: { status: { $in: ['new', 'accepted', 'in_progress'] } } as any,
        })

        ctx.body = {
            data: {
                from: from.toISOString(),
                to: to.toISOString(),
                allTime,
                unassignedRequestsCount,
                avgTimeToAcceptMinutes,
                conversionByEmployee,
                ...current,
                previous,
                topProducts,
                clientsCount,
                productsCount,
                activeOrdersCount,
            },
        }
    },

    /** Атомарно «взять заказ в работу»: привязать employee + сдвинуть статус с new → accepted.
     *  Релейшн order.employee в Strapi 5 Postgres хранится в join-таблице `orders_employee_lnk`
     *  (колонки order_id, employee_id). Условный INSERT ... WHERE NOT EXISTS даёт атомарность. */
    async take(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')

        try {
            // 1) Условный INSERT: только если ссылки ещё нет.
            const insertSql = `
                INSERT INTO orders_employee_lnk (order_id, employee_id)
                SELECT ?, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM orders_employee_lnk WHERE order_id = ?
                )
                RETURNING id
            `
            const rawRes: any = await strapi.db.connection.raw(insertSql, [id, employee.id, id])
            const inserted = Array.isArray(rawRes?.rows) ? rawRes.rows.length : (rawRes?.rowCount ?? 0)
            if (!inserted) return ctx.conflict('ALREADY_TAKEN')

            // Статус заказа при «взять в работу» не меняется — сотрудник сначала звонит
            // клиенту, затем подтверждает отдельным шагом (status_changed → accepted).
            const row = await strapi.db.query('api::order.order').findOne({
                where: { id },
                populate: ['employee', 'client', 'items'],
            })

            try {
                await strapi.service('api::order.order').logEvent(
                    id, 'taken', { employeeId: employee.id }, employee.id,
                )
            } catch (e: any) {
                strapi.log.warn('[orders/take.logEvent] ' + (e?.message || e))
            }

            ctx.body = { data: row }
        } catch (err: any) {
            strapi.log.error('[orders/take] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'take failed')
        }
    },

    /** Правка заказа (manager|duty): состав, клиент, доставка, оплата, комментарий.
     *  Только пока заказ не подтверждён клиентом. Цены пересчитываются сервером. */
    async edit(ctx) {
        const employee = ctx.state.employee
        if (!employee || !['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        if (!body?.client?.phone || !Array.isArray(body?.items) || !body.items.length) {
            return ctx.badRequest('phone and items are required')
        }
        try {
            const order = await strapi.service('api::order.order').editOrder(id, body, employee.id)
            ctx.body = { data: order }
        } catch (err: any) {
            if (err instanceof ApplicationError) {
                if (err.message === 'ORDER_LOCKED') return ctx.conflict('ORDER_LOCKED', (err as any).details || {})
                return ctx.badRequest(err.message, (err as any).details || {})
            }
            strapi.log.error('[staff/orders/edit] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'order edit failed')
        }
    },

    /** Отмена заказа с обязательной причиной; все транзакции заказа сторнируются. */
    async cancel(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        try {
            const order = await strapi.service('api::order.order').cancelOrder(id, body?.reason, employee.id)
            ctx.body = { data: order }
        } catch (err: any) {
            if (err instanceof ApplicationError) {
                if (err.message === 'ALREADY_CANCELED' || err.message === 'ORDER_DONE') return ctx.conflict(err.message)
                return ctx.badRequest(err.message)
            }
            strapi.log.error('[staff/orders/cancel] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'order cancel failed')
        }
    },

    /** Переопределяем core `update`, чтобы любые изменения через PUT попадали в историю.
     *  Поведение API и формат ответа не меняются — вызываем `super.update(ctx)`. */
    /** Core `strapi.documents(uid).update({ documentId })` для D&P:false иногда отдаёт 404,
     *  даже когда запись найдена через `strapi.db.query`. Поэтому ходим через query напрямую. */
    async update(ctx) {
        const employee = (ctx.state as any).employee
        const documentId = ctx.params.id as string
        const before = documentId
            ? await strapi.db.query('api::order.order').findOne({
                where: { documentId },
                select: ['id', 'status', 'cancelReason', 'total', 'paidAmount', 'paymentStatus'],
            })
            : null
        if (!before) return ctx.notFound()

        const body: any = ctx.request.body?.data ? ctx.request.body.data : (ctx.request.body || {})
        const payload = { ...(body as Record<string, any>) }
        const statusNote = typeof payload.statusNote === 'string' ? payload.statusNote.trim() : ''
        delete payload.statusNote
        delete payload.id
        delete payload.documentId

        // Деньги и состав меняются только через расчёт: PUT /staff/orders/:id/edit.
        const moneyFields = MONEY_FIELDS.filter((k) => k in payload)
        if (moneyFields.length) {
            return ctx.badRequest('USE_EDIT_ENDPOINT', { fields: moneyFields })
        }
        // После подтверждения клиентом данные заказа заморожены.
        const lockedFields = EDITABLE_FIELDS.filter((k) => k in payload)
        if (lockedFields.length && before.status !== 'new') {
            return ctx.conflict('ORDER_LOCKED', { fields: lockedFields, status: before.status })
        }
        // Отменённый заказ не «воскрешаем»: его транзакции уже сторнированы.
        if (before.status === 'canceled' && payload.status && payload.status !== 'canceled') {
            return ctx.conflict('ORDER_CANCELED')
        }
        // Завершить можно только полностью оплаченный заказ (этап «Оплачен» идёт перед «Завершён»).
        if (payload.status === 'done' && before.status !== 'done') {
            const total = Number(before.total || 0)
            const paid = Number(before.paidAmount || 0)
            const isPaid = before.paymentStatus === 'paid' || before.paymentStatus === 'overpaid' || paid >= total
            if (!isPaid) {
                return ctx.conflict('ORDER_NOT_PAID', { total, paidAmount: paid, remaining: Math.max(0, total - paid) })
            }
        }
        // Отмена — через единый сервис: причина обязательна, транзакции сторнируются.
        if (payload.status === 'canceled' && before.status !== 'canceled') {
            try {
                const result = await strapi.service('api::order.order').cancelOrder(
                    before.id, payload.cancelReason, employee?.id ?? null, statusNote || undefined,
                )
                ctx.body = { data: result }
                return
            } catch (err: any) {
                if (err instanceof ApplicationError) return ctx.badRequest(err.message)
                throw err
            }
        }

        await strapi.db.query('api::order.order').update({
            where: { id: before.id },
            data: payload,
        })

        const result = await strapi.db.query('api::order.order').findOne({
            where: { id: before.id },
            populate: ['items', 'client', 'employee', 'request', 'transactions'],
        })

        if (employee) {
            try {
                const next = await strapi.db.query('api::order.order').findOne({
                    where: { id: before.id }, select: ['status', 'cancelReason'],
                })
                if (next) {
                    if (next.status !== before.status) {
                        await strapi.service('api::order.order').logEvent(
                            before.id, 'status_changed',
                            { from: before.status, to: next.status, cancelReason: next.cancelReason ?? null },
                            employee.id,
                            statusNote || undefined,
                        )
                    } else {
                        const fields = Object.keys(payload)
                        if (fields.length) {
                            await strapi.service('api::order.order').logEvent(
                                before.id, 'updated', { fields }, employee.id,
                            )
                        }
                    }
                }
            } catch (e: any) {
                strapi.log.warn('[orders/update.logEvent] ' + (e?.message || e))
            }
        }

        ctx.body = { data: result }
    },

    /** Прокси upload-плагина под staff-JWT: клиентский /staff/upload → upload content-api. */
    async staffUpload(ctx) {
        const uploadCtrl = strapi.plugin('upload').controller('content-api') as any
        if (!uploadCtrl?.upload) return ctx.internalServerError('upload controller not found')
        return uploadCtrl.upload(ctx)
    },

    /** Ручное создание заказа сотрудником (manager|duty). */
    async createManual(ctx) {
        const employee = ctx.state.employee
        if (!employee || !['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')
        try {
            const body = (ctx.request.body?.data || ctx.request.body) as any
            if (!body?.client?.phone || !body?.items?.length) {
                return ctx.badRequest('phone and items are required')
            }
            const created = await strapi.service('api::order.order').buildAndCreate(body, {
                source: 'manual',
                createdById: employee.id,
            })
            ctx.body = { data: created }
        } catch (err: any) {
            if (err instanceof ApplicationError) return ctx.badRequest(err.message)
            strapi.log.error('[staff/orders] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'order create failed')
        }
    },

    // --- Dispatch: manager/duty назначает курьера или помечает Яндекс-доставку ---
    async dispatch(ctx: any) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const { documentId } = ctx.params
        const body = (ctx.request.body?.data || ctx.request.body) as {
            deliveryMethodCode?: string | null
            employeeDocId?: string | null
        }
        if (!body?.deliveryMethodCode) return ctx.badRequest('deliveryMethodCode required')

        // Валидируем, что способ существует и активен.
        const method = await strapi.db.query('api::delivery-method.delivery-method').findOne({
            where: { code: body.deliveryMethodCode },
        })
        if (!method) return ctx.badRequest('unknown deliveryMethodCode')
        if (method.active === false) return ctx.badRequest('delivery method inactive')

        const data: Record<string, any> = {
            deliveryMethodCode: body.deliveryMethodCode,
        }

        if (body.employeeDocId) {
            const target = await strapi.documents('api::employee.employee').findOne({ documentId: body.employeeDocId })
            if (!target || target.role !== 'courier') return ctx.badRequest('employee must be courier')
            if (target.active === false) return ctx.badRequest('courier inactive')
            data.employee = target.id
            data.deliveryBy = 'courier'
        } else {
            data.employee = null
            data.deliveryBy = body.deliveryMethodCode === 'yandex' ? 'yandex' : null
        }

        const updated = await strapi.documents('api::order.order').update({
            documentId,
            data,
            populate: ['employee', 'client', 'items'],
        })
        if (!updated) return ctx.notFound()
        try {
            await strapi.service('api::order.order').logEvent(
                (updated as any).id, 'dispatched',
                { deliveryMethodCode: body.deliveryMethodCode, employeeId: data.employee ?? null },
                employee.id,
            )
        } catch (e: any) {
            strapi.log.warn('[orders/dispatch.logEvent] ' + (e?.message || e))
        }
        ctx.body = { data: updated }
    },

    // --- Courier: свой список + accept + confirm ---
    async courierList(ctx: any) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const statusParam = String(ctx.query?.status || 'new')
        const allowed = new Set(['new', 'accepted', 'in_progress', 'done'])
        if (!allowed.has(statusParam)) return ctx.badRequest('bad status')
        const page = Math.max(1, Number(ctx.query?.page || 1))
        const pageSize = Math.min(100, Math.max(1, Number(ctx.query?.pageSize || 25)))
        const where: any = { employee: { id: employee.id }, status: statusParam }
        const [rows, total] = await Promise.all([
            strapi.db.query('api::order.order').findMany({
                where,
                orderBy: { createdAt: 'desc' },
                limit: pageSize,
                offset: (page - 1) * pageSize,
                populate: ['items', 'client'],
            }),
            strapi.db.query('api::order.order').count({ where }),
        ])
        ctx.body = { data: rows, meta: { pagination: { page, pageSize, total } } }
    },

    async courierAccept(ctx: any) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const { documentId } = ctx.params
        const order = await strapi.documents('api::order.order').findOne({
            documentId, populate: ['employee'],
        })
        if (!order) return ctx.notFound()
        if ((order as any).employee?.id !== employee.id) return ctx.forbidden('NOT_YOURS')
        if (!['new', 'accepted'].includes((order as any).status)) return ctx.conflict('WRONG_STATUS')
        const updated = await strapi.documents('api::order.order').update({
            documentId,
            data: { status: 'in_progress' },
            populate: ['client', 'items'],
        })
        try {
            await strapi.service('api::order.order').logEvent(
                (updated as any).id, 'status_changed', { to: 'in_progress' }, employee.id,
            )
        } catch { /* noop */ }
        ctx.body = { data: updated }
    },

    async courierConfirm(ctx: any) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const { documentId } = ctx.params
        const order = await strapi.documents('api::order.order').findOne({
            documentId, populate: ['employee'],
        })
        if (!order) return ctx.notFound()
        if ((order as any).employee?.id !== employee.id) return ctx.forbidden('NOT_YOURS')
        if ((order as any).status !== 'in_progress') return ctx.conflict('WRONG_STATUS')
        const updated = await strapi.documents('api::order.order').update({
            documentId,
            data: { status: 'done' },
            populate: ['client', 'items'],
        })
        try {
            await strapi.service('api::order.order').logEvent(
                (updated as any).id, 'status_changed', { to: 'done' }, employee.id,
            )
        } catch { /* noop */ }
        ctx.body = { data: updated }
    },
}))
