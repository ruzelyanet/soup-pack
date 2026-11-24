import { factories } from '@strapi/strapi'

/** Привести к +998XXXXXXXXX. */
function normalizePhone(input: string): string {
    const digits = (input || '').replace(/\D/g, '').slice(-9)
    return '+998' + digits
}

function safeClient(c: any) {
    return {
        id: c.id,
        documentId: c.documentId,
        phone: c.phone,
        fullName: c.fullName || '',
        address: c.address || null,
        lat: c.lat != null ? Number(c.lat) : null,
        lng: c.lng != null ? Number(c.lng) : null,
    }
}

export default factories.createCoreController('api::client.client', ({ strapi }) => ({
    async signIn(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as { phone?: string }
        if (!body?.phone) return ctx.badRequest('phone is required')

        const phone = normalizePhone(body.phone)
        if (phone.length !== 13) return ctx.badRequest('invalid phone')

        let client = await strapi.db
            .query('api::client.client')
            .findOne({ where: { phone } })

        if (!client) {
            client = await strapi.db.query('api::client.client').create({
                data: { phone, fullName: '' },
            })
        }

        ctx.body = { data: safeClient(client) }
    },

    /** Поиск клиента по номеру БЕЗ создания. Для автозаполнения формы на чекауте. */
    async lookup(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as { phone?: string }
        if (!body?.phone) return ctx.badRequest('phone is required')

        const phone = normalizePhone(body.phone)
        if (phone.length !== 13) return ctx.badRequest('invalid phone')

        const client = await strapi.db
            .query('api::client.client')
            .findOne({ where: { phone } })

        if (!client) {
            ctx.body = { data: { found: false } }
            return
        }

        const ordersCount = await strapi.db
            .query('api::order.order')
            .count({ where: { client: { id: client.id } } })

        ctx.body = {
            data: {
                found: true,
                client: safeClient(client),
                ordersCount,
            },
        }
    },

    /** Обновить профиль клиента по телефону (имя/адрес/координаты). */
    async updateMe(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as {
            phone?: string
            fullName?: string
            address?: string | null
            lat?: number | null
            lng?: number | null
        }
        if (!body?.phone) return ctx.badRequest('phone is required')

        const phone = normalizePhone(body.phone)
        if (phone.length !== 13) return ctx.badRequest('invalid phone')

        const existing = await strapi.db
            .query('api::client.client')
            .findOne({ where: { phone } })
        if (!existing) return ctx.notFound('client not found')

        const patch: Record<string, any> = {}
        if (typeof body.fullName === 'string') patch.fullName = body.fullName
        if ('address' in body) patch.address = body.address || null
        if ('lat' in body) patch.lat = body.lat ?? null
        if ('lng' in body) patch.lng = body.lng ?? null

        const updated = await strapi.db
            .query('api::client.client')
            .update({ where: { id: existing.id }, data: patch })

        ctx.body = { data: safeClient(updated) }
    },

    /** Агрегаты по заказам клиента: всего/кол-во, средний чек, последняя покупка, помесячная гистограмма (6 месяцев). */
    async stats(ctx: any) {
        const { documentId } = ctx.params
        const c = await strapi.documents('api::client.client').findOne({ documentId })
        if (!c) return ctx.notFound()

        const orders = await strapi.db.query('api::order.order').findMany({
            where: { client: { id: c.id }, status: { $ne: 'canceled' } },
            select: ['id', 'total', 'createdAt'],
        })

        const totalCount = orders.length
        const totalAmount = orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0)
        const avgCheck = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0
        const lastPurchaseAt = orders.reduce((max: string | null, o: any) => {
            return !max || new Date(o.createdAt) > new Date(max) ? o.createdAt : max
        }, null as string | null)

        // Помесячная гистограмма за последние 6 месяцев.
        const now = new Date()
        const months: Array<{ ym: string; label: string; count: number; amount: number }> = []
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            months.push({
                ym,
                label: d.toLocaleString('ru-RU', { month: 'short' }),
                count: 0,
                amount: 0,
            })
        }
        for (const o of orders) {
            const d = new Date(o.createdAt)
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const bucket = months.find((m) => m.ym === ym)
            if (bucket) { bucket.count++; bucket.amount += Number(o.total || 0) }
        }

        ctx.body = { data: { totalCount, totalAmount, avgCheck, lastPurchaseAt, months } }
    },
}))
