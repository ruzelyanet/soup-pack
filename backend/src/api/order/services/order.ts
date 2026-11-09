import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import { getRealtimeBus, type OrderSummary, type OrderEventKind } from '../../../utils/realtime'

const { ApplicationError } = errors

type OrderClientInput = {
    fullName?: string
    phone: string
    address?: string | null
    lat?: number | null
    lng?: number | null
}

type OrderLineInput = {
    productId?: number | null
    name?: string
    price?: number
    qty: number
    orderSetId?: number | null
    setDiscountPercent?: number | null
    fromSetName?: string | null
}

export type BuildOrderInput = {
    client: OrderClientInput
    items: OrderLineInput[]
    paymentMethod?: 'cash' | 'card' | 'click' | 'payme' | 'transfer'
    deliveryMethod?: 'courier_now' | 'preorder'
    deliverySlotAt?: string | null
    comment?: string | null
    address?: string | null
    lat?: number | null
    lng?: number | null
}

export type BuildOrderOptions = {
    source: 'catalog' | 'request' | 'manual' | 'telegram'
    createdById?: number | null
    requestId?: number | null
    dryRun?: boolean
    /** Закрепить заказ за создавшим сотрудником (по умолчанию — да, если `createdById` задан). */
    assignToCreator?: boolean
}

function normalizePhone(input: string): string {
    const digits = (input || '').replace(/\D/g, '').slice(-9)
    return '+998' + digits
}

/** Старый формат payload-а каталога → QuoteInput.items.
 *  Строки с одинаковым `orderSetId` группируем в экземпляр set со стабильной `qty`
 *  (минимум 1, т. к. явного числа экземпляров нет; дубль идентичных set-линий трактуем как qty экземпляра). */
function legacyItemsToQuoteItems(items: OrderLineInput[]) {
    const quoteItems: Array<
        | { type: 'product'; productId: number; qty: number }
        | { type: 'set'; orderSetId: number; qty: number }
    > = []
    const setCounts = new Map<number, number>()
    for (const i of items || []) {
        if (i.orderSetId) {
            const sid = Number(i.orderSetId)
            if ((i as any).type === 'set') {
                // Новый формат корзины: одна позиция набора с явным qty экземпляров.
                const n = Math.max(1, Math.floor(Number(i.qty) || 1))
                setCounts.set(sid, (setCounts.get(sid) || 0) + n)
            } else {
                // Старый формат: строки-товары набора, число экземпляров неизвестно → 1.
                setCounts.set(sid, Math.max(1, setCounts.get(sid) || 0))
            }
        }
    }
    for (const sid of setCounts.keys()) {
        quoteItems.push({ type: 'set', orderSetId: Number(sid), qty: setCounts.get(sid) || 1 })
    }
    for (const i of items || []) {
        if (i.orderSetId) continue
        if (!i.productId) continue
        quoteItems.push({ type: 'product', productId: Number(i.productId), qty: Math.max(1, Math.floor(Number(i.qty) || 1)) })
    }
    return quoteItems
}

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    normalizePhone,

    /** Полный расчёт без сохранения — через pricing.quote. */
    async preview(input: BuildOrderInput) {
        const q = await strapi.service('api::price.pricing').quote({
            items: legacyItemsToQuoteItems(input.items),
            deliveryMethod: input.deliveryMethod || 'courier_now',
            paymentMethod: input.paymentMethod,
            source: 'manual',
        })
        return {
            items: q.lines,
            subtotal: q.subtotal,
            cartDiscountPercent: pickCartTierPercent(q),
            cartDiscountAmount: cartTierAmount(q),
            total: q.total,
            discountTotal: q.discountTotal,
            appliedDiscounts: q.appliedDiscounts,
            hints: q.hints,
            deliveryMethod: input.deliveryMethod || 'courier_now',
        }
    },

    /** Создать заказ единым сервисом (используется каталогом, админкой и конверсией заявок).
     *  Полный расчёт — через `pricing.quote`. Для совместимости со старым payload-ом принимает
     *  строки `{productId, qty, orderSetId?}`; `price`/`setDiscountPercent` из тела игнорируются.
     *  Заказ, созданный сотрудником (`createdById`), сразу закреплён за ним — этап «Взят в работу». */
    async buildAndCreate(input: BuildOrderInput, options: BuildOrderOptions) {
        const phone = requirePhone(input)
        const deliveryMethod = input.deliveryMethod || 'courier_now'

        const q = await strapi.service('api::price.pricing').quote({
            items: legacyItemsToQuoteItems(input.items),
            deliveryMethod,
            paymentMethod: input.paymentMethod,
            source: options.source,
        })

        if (options.dryRun) {
            return {
                items: q.lines,
                subtotal: q.subtotal,
                cartDiscountPercent: pickCartTierPercent(q),
                cartDiscountAmount: cartTierAmount(q),
                total: q.total,
                discountTotal: q.discountTotal,
                appliedDiscounts: q.appliedDiscounts,
                hints: q.hints,
                deliveryMethod,
            }
        }

        const client = await upsertClient(strapi, input, phone)

        const code = 'SP-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 90 + 10)

        const data: Record<string, any> = {
            code,
            status: 'new',
            paymentMethod: input.paymentMethod || 'cash',
            deliveryMethod,
            deliverySlotAt: deliveryMethod === 'preorder' ? (input.deliverySlotAt || null) : null,
            comment: input.comment || null,
            ...totalsFromQuote(q),
            address: input.address ?? null,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            items: lineItemsFromQuote(q),
            client: client.documentId,
            source: options.source,
            paidAmount: 0,
            paymentStatus: 'unpaid',
        }
        let creatorId: number | null = null
        if (options.createdById) {
            const emp = await strapi.db.query('api::employee.employee').findOne({
                where: { id: options.createdById },
                select: ['id', 'documentId'],
            })
            if (emp) {
                creatorId = Number(emp.id)
                data.createdByEmployee = emp.documentId
                // Сотрудник сам оформил заказ — он же за него и отвечает.
                if (options.assignToCreator !== false) data.employee = emp.documentId
            }
        }
        if (options.requestId) {
            const req = await strapi.db.query('api::request.request').findOne({
                where: { id: options.requestId },
                select: ['documentId'],
            })
            if (req) data.request = req.documentId
        }

        const created = await strapi.documents('api::order.order').create({
            data: data as any,
            populate: ['items', 'client', 'request', 'employee'] as any,
        })
        const orderId = Number((created as any).id)

        // Плоские записи order-discount — для отчётов. Пишем после создания заказа, вне транзакции
        // (при сбое получим неполные записи, но заказ целостен; критерий «неизменяемый снимок» выполнен).
        try {
            await writeOrderDiscounts(strapi, orderId, q)
        } catch (e: any) {
            strapi.log?.warn?.('[order] order-discount write failed: ' + (e?.message || e))
        }

        try {
            await (this as any).logEvent(orderId, 'created', { source: options.source }, options.createdById ?? null)
            if (creatorId && data.employee) {
                await (this as any).logEvent(orderId, 'taken', { employeeId: creatorId, auto: true }, creatorId)
            }
        } catch (e: any) {
            strapi.log?.warn?.('[order.logEvent/created] ' + (e?.message || e))
        }

        return created
    },

    /** Изменить состав и данные заказа. Только пока заказ не подтверждён клиентом (`status = new`).
     *  Цены и скидки пересчитываются заново (по действующим на момент правки), оплата — по новой сумме. */
    async editOrder(orderId: number, input: BuildOrderInput, employeeId: number | null) {
        const before = await strapi.db.query('api::order.order').findOne({
            where: { id: orderId },
            populate: ['client', 'items'],
        })
        if (!before) throw new ApplicationError('order not found')
        if (before.status !== 'new') {
            const err: any = new ApplicationError('ORDER_LOCKED')
            err.details = { status: before.status }
            throw err
        }
        if (!Array.isArray(input?.items) || !input.items.length) throw new ApplicationError('items are required')

        const phone = requirePhone(input)
        const deliveryMethod = input.deliveryMethod || 'courier_now'

        const q = await strapi.service('api::price.pricing').quote({
            items: legacyItemsToQuoteItems(input.items),
            deliveryMethod,
            paymentMethod: input.paymentMethod,
            source: before.source || 'manual',
        })

        const client = await upsertClient(strapi, input, phone)

        const next: Record<string, any> = {
            paymentMethod: input.paymentMethod || before.paymentMethod || 'cash',
            deliveryMethod,
            deliverySlotAt: deliveryMethod === 'preorder' ? (input.deliverySlotAt || null) : null,
            comment: input.comment ?? null,
            address: input.address ?? null,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            ...totalsFromQuote(q),
        }

        // Что поменялось — для истории.
        const changed: string[] = []
        if (itemsSignature(before.items) !== itemsSignature(q.lines)) changed.push('items')
        if (Number(before.client?.id) !== Number(client.id)) changed.push('client')
        for (const k of ['address', 'deliveryMethod', 'deliverySlotAt', 'paymentMethod', 'comment'] as const) {
            if (normalizeForCompare(before[k]) !== normalizeForCompare(next[k])) changed.push(k)
        }

        const totalBefore = Number(before.total || 0)

        await strapi.db.transaction(async () => {
            const updated = await strapi.documents('api::order.order').update({
                documentId: before.documentId,
                data: { ...next, items: lineItemsFromQuote(q), client: client.documentId } as any,
            } as any)
            if (!updated) throw new ApplicationError('order update failed')

            await strapi.db.query('api::order-discount.order-discount').deleteMany({
                where: { order: { id: orderId } },
            })
            await writeOrderDiscounts(strapi, orderId, q)

            // Сумма заказа могла измениться — пересчитать статус оплаты.
            await strapi.service('api::transaction.transaction').recalcOrder(orderId)
        })

        try {
            await (this as any).logEvent(
                orderId, 'updated',
                { fields: changed, totalBefore, totalAfter: q.total },
                employeeId,
            )
        } catch (e: any) {
            strapi.log?.warn?.('[order.logEvent/edited] ' + (e?.message || e))
        }

        return strapi.db.query('api::order.order').findOne({
            where: { id: orderId },
            populate: ['items', 'client', 'employee', 'request', 'transactions'],
        })
    },

    /** Отменить заказ. Причина обязательна. Все проведённые транзакции заказа (оплаты и возвраты)
     *  сторнируются с этой же причиной, `paidAmount` пересчитывается. Завершённый заказ отменить нельзя. */
    async cancelOrder(orderId: number, reason: string, employeeId: number | null, note?: string) {
        const cancelReason = String(reason || '').trim()
        if (!cancelReason) throw new ApplicationError('CANCEL_REASON_REQUIRED')
        if (cancelReason.length > 250) throw new ApplicationError('CANCEL_REASON_TOO_LONG')

        const before = await strapi.db.query('api::order.order').findOne({
            where: { id: orderId },
            select: ['id', 'status'],
        })
        if (!before) throw new ApplicationError('order not found')
        if (before.status === 'canceled') throw new ApplicationError('ALREADY_CANCELED')
        if (before.status === 'done') throw new ApplicationError('ORDER_DONE')

        let cancelled: Array<{ code: string; kind: string; amount: number }> = []
        await strapi.db.transaction(async () => {
            await strapi.db.query('api::order.order').update({
                where: { id: orderId },
                data: { status: 'canceled', cancelReason },
            })
            cancelled = await strapi.service('api::transaction.transaction')
                .cancelAllForOrder(orderId, `Отмена заказа: ${cancelReason}`, employeeId)
        })

        try {
            await (this as any).logEvent(
                orderId, 'status_changed',
                {
                    from: before.status, to: 'canceled', cancelReason,
                    cancelledTransactions: cancelled.map((t) => t.code),
                },
                employeeId,
                note || undefined,
            )
        } catch (e: any) {
            strapi.log?.warn?.('[order.logEvent/canceled] ' + (e?.message || e))
        }

        return strapi.db.query('api::order.order').findOne({
            where: { id: orderId },
            populate: ['items', 'client', 'employee', 'request', 'transactions'],
        })
    },

    /** Единая точка истории заказа: пишет `order-event` и публикует событие в шину. */
    async logEvent(orderId: number, kind: string, payload: any, actorId: number | null, note?: string) {
        await strapi.db.query('api::order-event.order-event').create({
            data: {
                kind,
                payload: payload ?? null,
                note: note ?? null,
                order: orderId,
                actor: actorId ?? null,
                publishedAt: new Date(),
            },
        })
        try {
            const bus = getRealtimeBus()
            if (kind === 'created') {
                const row = await strapi.db.query('api::order.order').findOne({
                    where: { id: orderId },
                    select: ['id', 'documentId', 'code', 'status', 'total',
                             'deliveryMethod', 'deliverySlotAt', 'paymentMethod', 'source', 'createdAt'],
                    populate: {
                        client: { select: ['fullName'] },
                        items:  { select: ['qty'] },
                    } as any,
                })
                if (row) {
                    const itemsCount = ((row as any).items || []).reduce(
                        (s: number, it: any) => s + Number(it.qty || 0), 0,
                    )
                    const summary: OrderSummary = {
                        id: row.id,
                        documentId: (row as any).documentId,
                        code: row.code,
                        status: row.status,
                        clientName: ((row as any).client?.fullName as string | null) ?? null,
                        itemsCount,
                        total: Number(row.total || 0),
                        deliveryMethod: row.deliveryMethod,
                        deliverySlotAt: row.deliverySlotAt
                            ? new Date(row.deliverySlotAt).toISOString() : null,
                        paymentMethod: row.paymentMethod,
                        source: row.source,
                        createdAt: new Date(row.createdAt).toISOString(),
                    }
                    bus.publish({ scope: 'orders', type: 'order.created', orderId, summary, actorId })
                }
            } else {
                const row = await strapi.db.query('api::order.order').findOne({
                    where: { id: orderId }, select: ['status'],
                })
                bus.publish({
                    scope: 'orders', type: 'order.updated', orderId,
                    kind: kind as OrderEventKind,
                    status: (row as any)?.status || '',
                    actorId,
                })
            }
        } catch (e: any) {
            strapi.log?.warn?.('[realtime.publish/order] ' + (e?.message || e))
        }
    },
}))

/** Для совместимости с полями `order.cartDiscountPercent/Amount`: находим скидку на чек
 *  из группы `cart-tier` (миграция §4) и возвращаем её процент. Если такой скидки нет — null. */
function pickCartTierPercent(q: any): number | null {
    const applied = q.appliedDiscounts?.find?.((a: any) => {
        // Нам нужно узнать, была ли применена именно order-уровневая скидка. У нас эта информация
        // не напрямую выставлена — но мы можем посмотреть в discounts любой строки.
        const matched = q.lines?.some?.((l: any) =>
            l.discounts?.some?.((d: any) => d.discountId === a.discountId && d.level === 'order'),
        )
        return matched
    })
    if (!applied) return null
    // Процент читаем из самого benefitValue (percent-скидка).
    const d = q.lines[0]?.discounts?.find?.((x: any) => x.discountId === applied.discountId && x.level === 'order')
    return d?.benefitType === 'percent' ? Number(d.benefitValue) : null
}

function cartTierAmount(q: any): number | null {
    const total = (q.lines || []).reduce((s: number, l: any) => {
        for (const d of l.discounts || []) {
            if (d.level === 'order') s += Number(d.amount || 0)
        }
        return s
    }, 0)
    return total > 0 ? total : null
}


// ────────── Вспомогательные функции создания / правки ──────────

function requirePhone(input: BuildOrderInput): string {
    const phoneRaw = String(input?.client?.phone || '').trim()
    if (!phoneRaw) throw new ApplicationError('phone is required')
    const phone = normalizePhone(phoneRaw)
    if (phone.length !== 13) throw new ApplicationError('invalid phone')
    return phone
}

/** Найти клиента по телефону или создать; обновить имя/адрес последними данными. */
async function upsertClient(strapi: any, input: BuildOrderInput, phone: string) {
    const latestAddress = input.address ?? input.client?.address ?? null
    const latestLat = input.lat ?? input.client?.lat ?? null
    const latestLng = input.lng ?? input.client?.lng ?? null

    let client = await strapi.db.query('api::client.client').findOne({ where: { phone } })
    if (client) {
        const patch: Record<string, any> = {}
        if (input.client?.fullName) patch.fullName = input.client.fullName
        if (latestAddress != null) patch.address = latestAddress
        if (latestLat != null) patch.lat = latestLat
        if (latestLng != null) patch.lng = latestLng
        if (Object.keys(patch).length) {
            client = await strapi.db.query('api::client.client').update({ where: { id: client.id }, data: patch })
        }
    } else {
        client = await strapi.db.query('api::client.client').create({
            data: {
                fullName: input.client?.fullName || '',
                phone,
                address: latestAddress,
                lat: latestLat,
                lng: latestLng,
            },
        })
    }
    if (!client) throw new ApplicationError('client upsert failed')
    return client
}

function totalsFromQuote(q: any) {
    return {
        subtotal: q.subtotal,
        cartDiscountPercent: pickCartTierPercent(q),
        cartDiscountAmount: cartTierAmount(q),
        discountTotal: q.discountTotal,
        total: q.total,
    }
}

/** Компонент order.line со всеми полями расчёта + legacy-поля для совместимости. */
function lineItemsFromQuote(q: any) {
    return (q.lines as any[]).map((l: any) => ({
        product: l.productId,
        name: l.name,
        price: l.unitPrice,
        qty: l.qty,
        lineKey: l.lineKey,
        basePrice: l.basePrice,
        priceId: l.priceId ?? null,
        unitPrice: l.unitPrice,
        orderDiscountAmount: l.orderDiscountAmount,
        lineTotal: l.lineTotal,
        orderSetId: l.orderSetId ?? null,
        setInstance: l.setInstance ?? null,
        discounts: l.discounts,
        setDiscountPercent: (l.discounts as any[]).find((d: any) => d.level === 'set')?.benefitValue ?? null,
        fromSetName: l.orderSetId ? ((l.discounts as any[]).find((d: any) => d.level === 'set')?.name ?? null) : null,
    }))
}

/** Плоские записи order-discount (по строке и скидке) — для отчётов. */
async function writeOrderDiscounts(strapi: any, orderId: number, q: any) {
    for (const l of q.lines) {
        for (const d of l.discounts) {
            if (!(d.amount > 0)) continue
            await strapi.db.query('api::order-discount.order-discount').create({
                data: {
                    order: orderId,
                    discount: d.discountId,
                    discountVersion: d.version,
                    level: d.level,
                    lineKey: l.lineKey,
                    amount: d.amount,
                    publishedAt: new Date(),
                },
            })
        }
    }
}

/** Сигнатура состава: товар/набор/кол-во — чтобы понять, менялся ли состав. */
function itemsSignature(lines: any[] | null | undefined): string {
    return (lines || [])
        .map((l: any) => [
            Number(l.productId ?? l.product?.id ?? l.product ?? 0),
            Number(l.orderSetId || 0),
            String(l.setInstance || ''),
            Number(l.qty || 0),
        ].join(':'))
        .sort()
        .join('|')
}

function normalizeForCompare(v: any): string {
    if (v == null || v === '') return ''
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        const t = Date.parse(v)
        return isNaN(t) ? v : new Date(t).toISOString()
    }
    return String(v)
}
