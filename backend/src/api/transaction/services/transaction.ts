import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'

const { ApplicationError } = errors

type Role = 'manager' | 'duty' | 'courier'
type Employee = { id: number; role: Role }
type Method = 'cash' | 'card' | 'click' | 'payme' | 'transfer'

type PaymentInput = {
    amount: number
    method: Method
    receivedById?: number | null
    comment?: string | null
    paidAt?: string | null
    idempotencyKey?: string | null
    allowOverpay?: boolean
}

type RefundInput = {
    amount: number
    method: Method
    receivedById?: number | null
    comment: string
    paidAt?: string | null
    idempotencyKey?: string | null
}

async function nextCode(strapi: any, kind: 'payment' | 'refund'): Promise<string> {
    const last = await strapi.db.query('api::transaction.transaction').findMany({
        orderBy: { id: 'desc' as const },
        limit: 1,
        select: ['id'],
    })
    const nextId = (last[0]?.id ?? 0) + 1
    return (kind === 'payment' ? 'TX-' : 'RF-') + String(nextId).padStart(6, '0')
}

async function logOrderEvent(strapi: any, orderId: number, kind: string, payload: any, actorId: number | null) {
    // Единая точка истории заказа + публикация в realtime-шину.
    await strapi.service('api::order.order').logEvent(orderId, kind, payload, actorId)
}

export default factories.createCoreService('api::transaction.transaction' as any, ({ strapi }: any) => ({
    /** Пересчёт итогов заказа по не-отменённым транзакциям. Вызывать в DB-транзакции. */
    async recalcOrder(orderId: number) {
        const txns = await strapi.db.query('api::transaction.transaction').findMany({
            where: { order: orderId, status: 'completed' },
            select: ['kind', 'amount'],
            limit: 1000,
        })
        let paid = 0
        let refunded = 0
        for (const t of txns) {
            const a = Number(t.amount || 0)
            if (t.kind === 'payment') paid += a
            else if (t.kind === 'refund') refunded += a
        }
        const paidAmount = Math.max(0, paid - refunded)

        const order = await strapi.db.query('api::order.order').findOne({
            where: { id: orderId },
            select: ['id', 'total'],
        })
        if (!order) return
        const total = Number(order.total || 0)

        let paymentStatus: string
        if (paidAmount <= 0) {
            paymentStatus = refunded > 0 && paid > 0 ? 'refunded' : 'unpaid'
        } else if (paidAmount < total) {
            paymentStatus = 'partial'
        } else if (paidAmount === total) {
            paymentStatus = 'paid'
        } else {
            paymentStatus = 'overpaid'
        }

        await strapi.db.query('api::order.order').update({
            where: { id: orderId },
            data: { paidAmount, paymentStatus },
        })
    },

    /** Создание платежа. */
    async createPayment(orderId: number, input: PaymentInput, employee: Employee) {
        if (!orderId) throw new ApplicationError('order id required')
        if (!input || typeof input.amount !== 'number' || !isFinite(input.amount)) {
            throw new ApplicationError('amount is required')
        }
        const amount = Math.round(Number(input.amount))
        if (amount <= 0) throw new ApplicationError('amount must be positive')
        if (!['cash', 'card', 'click', 'payme', 'transfer'].includes(input.method)) {
            throw new ApplicationError('invalid method')
        }

        // Идемпотентность — ранний return без транзакции.
        if (input.idempotencyKey) {
            const existing = await strapi.db.query('api::transaction.transaction').findOne({
                where: { idempotencyKey: input.idempotencyKey },
            })
            if (existing) return existing
        }

        const order = await strapi.db.query('api::order.order').findOne({
            where: { id: orderId },
            populate: ['client', 'employee'],
        })
        if (!order) throw new ApplicationError('order not found')
        if (order.status === 'canceled') throw new ApplicationError('ORDER_CANCELED')

        const total = Number(order.total || 0)
        const paidNow = Number(order.paidAmount || 0)
        const remainder = Math.max(0, total - paidNow)

        if (amount > remainder) {
            const isManager = employee.role === 'manager'
            if (!isManager || !input.allowOverpay) {
                throw new ApplicationError('AMOUNT_EXCEEDS_BALANCE')
            }
        }

        const receivedById = input.receivedById ?? employee.id

        // Правила для курьера: он может платёж только по своему заказу и только receivedBy=он.
        if (employee.role === 'courier') {
            if (order.employee?.id !== employee.id) {
                throw new ApplicationError('FORBIDDEN_ROLE')
            }
            if (receivedById !== employee.id) {
                throw new ApplicationError('FORBIDDEN_ROLE')
            }
        }

        const code = await nextCode(strapi, 'payment')

        const created = await strapi.db.transaction(async () => {
            const row = await strapi.db.query('api::transaction.transaction').create({
                data: {
                    code,
                    kind: 'payment',
                    method: input.method,
                    amount,
                    currency: 'UZS',
                    status: 'completed',
                    paidAt: input.paidAt || new Date(),
                    comment: input.comment || null,
                    idempotencyKey: input.idempotencyKey || null,
                    order: orderId,
                    client: order.client?.id ?? null,
                    receivedBy: receivedById,
                    createdByEmployee: employee.id,
                    publishedAt: new Date(),
                },
            })
            await this.recalcOrder(orderId)
            return row
        })

        await logOrderEvent(strapi, orderId, 'payment', { code: created.code, amount, method: input.method }, employee.id)
        return created
    },

    /** Возврат (только manager). */
    async createRefund(orderId: number, input: RefundInput, employee: Employee) {
        if (employee.role !== 'manager') throw new ApplicationError('FORBIDDEN_ROLE')
        if (!orderId) throw new ApplicationError('order id required')
        const amount = Math.round(Number(input.amount || 0))
        if (amount <= 0) throw new ApplicationError('amount must be positive')
        if (!['cash', 'card', 'click', 'payme', 'transfer'].includes(input.method)) {
            throw new ApplicationError('invalid method')
        }
        if (!String(input.comment || '').trim()) throw new ApplicationError('reason required')

        if (input.idempotencyKey) {
            const existing = await strapi.db.query('api::transaction.transaction').findOne({
                where: { idempotencyKey: input.idempotencyKey },
            })
            if (existing) return existing
        }

        const order = await strapi.db.query('api::order.order').findOne({
            where: { id: orderId },
            populate: ['client'],
        })
        if (!order) throw new ApplicationError('order not found')

        const paidNow = Number(order.paidAmount || 0)
        if (amount > paidNow) throw new ApplicationError('AMOUNT_EXCEEDS_BALANCE')

        const code = await nextCode(strapi, 'refund')

        const created = await strapi.db.transaction(async () => {
            const row = await strapi.db.query('api::transaction.transaction').create({
                data: {
                    code,
                    kind: 'refund',
                    method: input.method,
                    amount,
                    currency: 'UZS',
                    status: 'completed',
                    paidAt: input.paidAt || new Date(),
                    comment: input.comment,
                    idempotencyKey: input.idempotencyKey || null,
                    order: orderId,
                    client: order.client?.id ?? null,
                    receivedBy: input.receivedById ?? employee.id,
                    createdByEmployee: employee.id,
                    publishedAt: new Date(),
                },
            })
            await this.recalcOrder(orderId)
            return row
        })

        await logOrderEvent(strapi, orderId, 'refund', { code: created.code, amount, reason: input.comment }, employee.id)
        return created
    },

    /** Сторно всех проведённых транзакций заказа — при отмене заказа (вызывать в DB-транзакции).
     *  Возвращает список сторнированных. Роль не проверяется: отмена заказа уже авторизована. */
    async cancelAllForOrder(orderId: number, reason: string, employeeId: number | null) {
        const live = await strapi.db.query('api::transaction.transaction').findMany({
            where: { order: orderId, status: 'completed' },
            select: ['id', 'code', 'kind', 'amount'],
            limit: 1000,
        })
        for (const t of live) {
            await strapi.db.query('api::transaction.transaction').update({
                where: { id: t.id },
                data: {
                    status: 'cancelled',
                    cancelledAt: new Date(),
                    cancelledBy: employeeId,
                    cancelReason: String(reason || '').slice(0, 250),
                },
            })
        }
        await this.recalcOrder(orderId)
        return live.map((t: any) => ({ code: t.code, kind: t.kind, amount: Number(t.amount || 0) }))
    },

    /** Сторно (только manager). */
    async cancelOne(txnId: number, input: { reason: string }, employee: Employee) {
        if (employee.role !== 'manager') throw new ApplicationError('FORBIDDEN_ROLE')
        const reason = String(input?.reason || '').trim()
        if (!reason) throw new ApplicationError('reason required')

        const txn = await strapi.db.query('api::transaction.transaction').findOne({
            where: { id: txnId },
            populate: ['order'],
        })
        if (!txn) throw new ApplicationError('transaction not found')
        if (txn.status === 'cancelled') throw new ApplicationError('ALREADY_CANCELLED')

        const orderId = txn.order?.id
        if (!orderId) throw new ApplicationError('transaction has no order')

        const result = await strapi.db.transaction(async () => {
            const row = await strapi.db.query('api::transaction.transaction').update({
                where: { id: txnId },
                data: {
                    status: 'cancelled',
                    cancelledAt: new Date(),
                    cancelledBy: employee.id,
                    cancelReason: reason,
                },
            })
            await this.recalcOrder(orderId)
            return row
        })

        await logOrderEvent(strapi, orderId, 'tx-cancelled', { code: txn.code, reason }, employee.id)
        return result
    },
}))
