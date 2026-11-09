import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import type { BuildOrderInput } from '../services/order'

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
            const delivery = body?.deliveryMethod as string | undefined
            const deliverySlotAt = body?.deliverySlotAt as string | null | undefined

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
            if (delivery === 'preorder' && !deliverySlotAt) {
                fieldErrors.deliverySlotAt = 'Выберите дату и время предзаказа'
            }
            if (!Array.isArray(body?.items) || !body.items.length) {
                fieldErrors.items = 'Корзина пуста'
            }

            if (Object.keys(fieldErrors).length) {
                return ctx.badRequest('Проверьте форму заказа', { fieldErrors })
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
                deliveryMethod: body.deliveryMethod,
                deliverySlotAt: body.deliverySlotAt,
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
    async dashboard(ctx) {
        const employee = ctx.state.employee
        if (!employee || !['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')

        const q = (ctx.query || {}) as { from?: string; to?: string }
        const to = q.to ? new Date(q.to + 'T23:59:59') : new Date()
        const from = q.from ? new Date(q.from + 'T00:00:00') : new Date(to.getTime() - 7 * 86400_000)

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
            select: ['id', 'type', 'outcome', 'createdAt'],
            limit: 10000,
        })
        const byType: Record<string, { requests: number; converted: number; rate: number }> = {
            individual: { requests: 0, converted: 0, rate: 0 },
            shop:       { requests: 0, converted: 0, rate: 0 },
        }
        const byEmployeeAcc: Record<string, { id: number; name: string; requests: number; converted: number; rate: number }> = {}

        for (const r of periodRequests) {
            const t = r.type || 'individual'
            byType[t] = byType[t] || { requests: 0, converted: 0, rate: 0 }
            byType[t].requests += 1
            if (r.outcome === 'converted') byType[t].converted += 1

            const emp = (r as any).assignee
            if (emp?.id) {
                const key = String(emp.id)
                byEmployeeAcc[key] = byEmployeeAcc[key] || { id: emp.id, name: emp.fullName || `#${emp.id}`, requests: 0, converted: 0, rate: 0 }
                byEmployeeAcc[key].requests += 1
                if (r.outcome === 'converted') byEmployeeAcc[key].converted += 1
            }
        }
        for (const k of Object.keys(byType)) {
            const b = byType[k]
            b.rate = b.requests ? Math.round((b.converted / b.requests) * 100) : 0
        }
        const conversionByEmployee = Object.values(byEmployeeAcc).map((b) => ({
            ...b,
            rate: b.requests ? Math.round((b.converted / b.requests) * 100) : 0,
        }))

        // --- Продажи (по заказам) и Поступления (по транзакциям) за период ---
        const orders = await strapi.db.query('api::order.order').findMany({
            where: {
                createdAt: { $gte: from, $lte: to },
                status: { $ne: 'canceled' },
            } as any,
            select: ['total'],
            limit: 10000,
        })
        const salesTotal = orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0)

        const txns = await strapi.db.query('api::transaction.transaction').findMany({
            where: {
                status: 'completed',
                paidAt: { $gte: from, $lte: to },
            } as any,
            select: ['kind', 'amount'],
            limit: 10000,
        })
        let paymentsSum = 0
        let refundsSum = 0
        for (const t of txns) {
            const a = Number(t.amount || 0)
            if (t.kind === 'payment') paymentsSum += a
            else if (t.kind === 'refund') refundsSum += a
        }
        const receiptsTotal = paymentsSum - refundsSum

        ctx.body = {
            data: {
                from: from.toISOString(),
                to: to.toISOString(),
                unassignedRequestsCount,
                avgTimeToAcceptMinutes,
                conversionByType: byType,
                conversionByEmployee,
                salesTotal,
                receiptsTotal,
                paymentsSum,
                refundsSum,
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
}))
