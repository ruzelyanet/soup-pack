import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'

const { ApplicationError } = errors

type TxFilters = {
    from?: string
    to?: string
    method?: string
    employeeId?: string
    kind?: string
    status?: string
}

export default factories.createCoreController('api::transaction.transaction' as any, ({ strapi }: any) => ({
    /** Создать платёж по заказу. */
    async createPayment(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const orderId = Number(ctx.params.id)
        const body = (ctx.request.body?.data || ctx.request.body) as any
        try {
            const row = await strapi.service('api::transaction.transaction').createPayment(orderId, body, employee)
            ctx.body = { data: row }
        } catch (err: any) {
            const msg = err?.message
            if (msg === 'ORDER_CANCELED' || msg === 'AMOUNT_EXCEEDS_BALANCE' || msg === 'FORBIDDEN_ROLE') {
                return msg === 'FORBIDDEN_ROLE' ? ctx.forbidden(msg) : ctx.badRequest(msg)
            }
            if (err instanceof ApplicationError) return ctx.badRequest(msg)
            strapi.log.error('[tx/createPayment] ' + msg)
            return ctx.internalServerError(msg || 'payment failed')
        }
    },

    async createRefund(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const orderId = Number(ctx.params.id)
        const body = (ctx.request.body?.data || ctx.request.body) as any
        try {
            const row = await strapi.service('api::transaction.transaction').createRefund(orderId, body, employee)
            ctx.body = { data: row }
        } catch (err: any) {
            const msg = err?.message
            if (msg === 'FORBIDDEN_ROLE') return ctx.forbidden(msg)
            if (msg === 'AMOUNT_EXCEEDS_BALANCE') return ctx.badRequest(msg)
            if (err instanceof ApplicationError) return ctx.badRequest(msg)
            strapi.log.error('[tx/createRefund] ' + msg)
            return ctx.internalServerError(msg || 'refund failed')
        }
    },

    async cancelOne(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const id = Number(ctx.params.id)
        const body = (ctx.request.body?.data || ctx.request.body) as any
        try {
            const row = await strapi.service('api::transaction.transaction').cancelOne(id, body, employee)
            ctx.body = { data: row }
        } catch (err: any) {
            const msg = err?.message
            if (msg === 'FORBIDDEN_ROLE') return ctx.forbidden(msg)
            if (err instanceof ApplicationError) return ctx.badRequest(msg)
            strapi.log.error('[tx/cancel] ' + msg)
            return ctx.internalServerError(msg || 'cancel failed')
        }
    },

    async list(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const q = (ctx.query || {}) as TxFilters & { page?: string | number; pageSize?: string | number; code?: string; orderCode?: string }
        const where: Record<string, any> = {}
        if (q.method) where.method = q.method
        if (q.kind) where.kind = q.kind
        if (q.status) where.status = q.status
        if (q.employeeId) where.receivedBy = Number(q.employeeId)
        if (q.from || q.to) {
            where.paidAt = {}
            if (q.from) (where.paidAt as any).$gte = new Date(q.from)
            if (q.to)   (where.paidAt as any).$lte = new Date(q.to)
        }
        if (q.code) where.code = { $containsi: String(q.code).trim() }
        if (q.orderCode) where.order = { code: { $containsi: String(q.orderCode).trim() } }
        if (employee.role === 'courier') where.receivedBy = employee.id

        const page = Math.max(1, Number(q.page) || 1)
        const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 25))

        const [rows, total] = await Promise.all([
            strapi.db.query('api::transaction.transaction').findMany({
                where,
                populate: ['order', 'client', 'receivedBy', 'createdByEmployee'],
                orderBy: { paidAt: 'desc' as const },
                limit: pageSize,
                offset: (page - 1) * pageSize,
            }),
            strapi.db.query('api::transaction.transaction').count({ where }),
        ])

        ctx.body = {
            data: rows,
            meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } },
        }
    },

    /** Итоги по способам + наличные на руках. */
    async summary(ctx) {
        const employee = ctx.state.employee
        if (!employee) return ctx.unauthorized()
        const q = (ctx.query || {}) as TxFilters
        const where: Record<string, any> = { status: 'completed' }
        if (q.from || q.to) {
            where.paidAt = {}
            if (q.from) (where.paidAt as any).$gte = new Date(q.from)
            if (q.to)   (where.paidAt as any).$lte = new Date(q.to)
        }

        const rows = await strapi.db.query('api::transaction.transaction').findMany({
            where,
            populate: ['receivedBy'],
            limit: 10000,
        })

        type MethodAgg = { payments: number; refunds: number; net: number }
        const byMethod: Record<string, MethodAgg> = {}
        const cashByEmployee: Record<string, { employee: any; total: number }> = {}
        for (const r of rows) {
            const amt = Number(r.amount || 0)
            const m = r.method || 'other'
            byMethod[m] = byMethod[m] || { payments: 0, refunds: 0, net: 0 }
            if (r.kind === 'payment') byMethod[m].payments += amt
            else if (r.kind === 'refund') byMethod[m].refunds += amt
            byMethod[m].net = byMethod[m].payments - byMethod[m].refunds

            // Наличные на руках — только payments в cash (refunds уменьшают: курьер отдал клиенту обратно).
            if (r.method === 'cash' && r.receivedBy) {
                const key = String(r.receivedBy.id)
                cashByEmployee[key] = cashByEmployee[key] || { employee: r.receivedBy, total: 0 }
                if (r.kind === 'payment') cashByEmployee[key].total += amt
                else if (r.kind === 'refund') cashByEmployee[key].total -= amt
            }
        }

        ctx.body = {
            data: {
                byMethod,
                cashOnHand: Object.values(cashByEmployee),
            },
        }
    },
}))
