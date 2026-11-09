/**
 * Жизненный цикл заказа: создание сотрудником (сразу «взят в работу»), правка до подтверждения,
 * отмена с обязательной причиной и сторно всех транзакций. Сервисы — настоящие, БД — in-memory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeStrapi } from './helpers/fake-strapi'

vi.mock('@strapi/strapi', () => ({
    factories: {
        createCoreService: (_uid: string, fn: any) => fn,
        createCoreController: (_uid: string, fn: any) => fn,
    },
}))

import pricingFactory from '../src/api/price/services/pricing'
import orderFactory from '../src/api/order/services/order'
import transactionFactory from '../src/api/transaction/services/transaction'
import orderControllerFactory from '../src/api/order/controllers/order'

const PRODUCT = 'api::product.product'
const ORDER_SET = 'api::order-set.order-set'
const DISCOUNT = 'api::discount.discount'
const ORDER = 'api::order.order'
const ORDER_DISCOUNT = 'api::order-discount.order-discount'
const ORDER_EVENT = 'api::order-event.order-event'
const TX = 'api::transaction.transaction'
const EMPLOYEE = 'api::employee.employee'

const duty = { id: 7, role: 'duty' as const }
const manager = { id: 8, role: 'manager' as const }

let fake: ReturnType<typeof createFakeStrapi>
let orders: any
let txs: any

beforeEach(() => {
    fake = createFakeStrapi()
    const pricing = (pricingFactory as any)({ strapi: fake.strapi })
    orders = (orderFactory as any)({ strapi: fake.strapi })
    txs = (transactionFactory as any)({ strapi: fake.strapi })
    fake.register('api::price.pricing', pricing)
    fake.register(ORDER, orders)
    fake.register(TX, txs)

    fake.seed(EMPLOYEE, [
        { id: 7, documentId: 'emp-7', fullName: 'Дильноза', role: 'duty' },
        { id: 8, documentId: 'emp-8', fullName: 'Азиз', role: 'manager' },
    ])
    fake.seed(PRODUCT, [
        { id: 1, name: 'Том-ям', price: 50000, available: true, category: { id: 10 } },
        { id: 2, name: 'Борщ', price: 30000, available: true, category: { id: 10 } },
        { id: 3, name: 'Морс', price: 12000, available: true, category: { id: 20 } },
    ])
    fake.seed(ORDER_SET, [{
        id: 100, name: 'Обед',
        items: [
            { qty: 1, product: { id: 2, name: 'Борщ', category: { id: 10 } } },
            { qty: 1, product: { id: 3, name: 'Морс', category: { id: 20 } } },
        ],
    }])
    fake.seed(DISCOUNT, [{
        id: 1, status: 'active', version: 1, name: 'Скидка на том-ям', level: 'line', benefitType: 'percent',
        benefitValue: 10, priority: 100, stackable: true, exclusiveGroup: null, conditions: null,
        targets: [{ targetType: 'product', product: { id: 1 } }],
    }])
})

const client = { fullName: 'Азиз Каримов', phone: '+998 90 123 45 67' }

function row(id: number) {
    return fake.table(ORDER).find((o) => o.id === id)!
}
function events(id: number, kind?: string) {
    return fake.table(ORDER_EVENT).filter((e) => e.order === id && (!kind || e.kind === kind))
}

async function createManual(items: any[] = [{ type: 'product', productId: 1, qty: 2 }]) {
    return orders.buildAndCreate({ client, items, paymentMethod: 'cash' }, { source: 'manual', createdById: duty.id })
}

describe('создание заказа сотрудником', () => {
    it('сразу закреплён за создателем: employee + событие taken, статус new', async () => {
        const o = await createManual()
        expect(row(o.id).status).toBe('new')
        expect(row(o.id).employee).toBe('emp-7')
        expect(row(o.id).createdByEmployee).toBe('emp-7')
        const taken = events(o.id, 'taken')
        expect(taken).toHaveLength(1)
        expect(taken[0].actor).toBe(7)
    })

    it('заказ из каталога (без сотрудника) остаётся ничьим', async () => {
        const o = await orders.buildAndCreate({ client, items: [{ type: 'product', productId: 1, qty: 1 }] }, { source: 'catalog' })
        expect(row(o.id).employee).toBeUndefined()
        expect(events(o.id, 'taken')).toHaveLength(0)
    })
})

describe('правка заказа', () => {
    it('пересчитывает состав, суммы и отчётные записи скидок', async () => {
        const o = await createManual([{ type: 'product', productId: 1, qty: 2 }])
        expect(row(o.id).total).toBe(90000)

        await orders.editOrder(o.id, {
            client, paymentMethod: 'click',
            items: [{ type: 'product', productId: 1, qty: 1 }, { type: 'set', orderSetId: 100, qty: 2 }],
        }, duty.id)

        const r = row(o.id)
        expect(r.total).toBe(45000 + 42000 * 2)
        expect(r.subtotal).toBe(50000 + 42000 * 2)
        expect(r.paymentMethod).toBe('click')
        expect(r.items).toHaveLength(1 + 4)
        const od = fake.table(ORDER_DISCOUNT).filter((d) => d.order === o.id)
        expect(od.reduce((s, d) => s + d.amount, 0)).toBe(r.discountTotal)

        const ev = events(o.id, 'updated').at(-1)!
        expect(ev.payload.fields).toEqual(expect.arrayContaining(['items', 'paymentMethod']))
        expect(ev.payload.totalBefore).toBe(90000)
        expect(ev.payload.totalAfter).toBe(r.total)
    })

    it('статус оплаты пересчитывается по новой сумме', async () => {
        const o = await createManual([{ type: 'product', productId: 1, qty: 2 }]) // 90 000
        await txs.createPayment(o.id, { amount: 90000, method: 'cash' }, duty)
        expect(row(o.id).paymentStatus).toBe('paid')

        await orders.editOrder(o.id, { client, items: [{ type: 'product', productId: 1, qty: 3 }] }, duty.id) // 135 000
        expect(row(o.id).paymentStatus).toBe('partial')

        await orders.editOrder(o.id, { client, items: [{ type: 'product', productId: 1, qty: 1 }] }, duty.id) // 45 000
        expect(row(o.id).paymentStatus).toBe('overpaid')
    })

    it('после подтверждения клиентом правка запрещена', async () => {
        const o = await createManual()
        row(o.id).status = 'accepted'
        await expect(orders.editOrder(o.id, { client, items: [{ type: 'product', productId: 2, qty: 1 }] }, duty.id))
            .rejects.toThrow('ORDER_LOCKED')
        expect(row(o.id).total).toBe(90000)
    })

    it('пустой состав — ошибка', async () => {
        const o = await createManual()
        await expect(orders.editOrder(o.id, { client, items: [] }, duty.id)).rejects.toThrow('items are required')
    })
})

describe('отмена заказа', () => {
    it('без причины — нельзя', async () => {
        const o = await createManual()
        await expect(orders.cancelOrder(o.id, '   ', duty.id)).rejects.toThrow('CANCEL_REASON_REQUIRED')
        expect(row(o.id).status).toBe('new')
    })

    it('сторнирует все транзакции, обнуляет оплату и пишет историю', async () => {
        const o = await createManual() // 90 000
        await txs.createPayment(o.id, { amount: 50000, method: 'cash' }, duty)
        await txs.createPayment(o.id, { amount: 40000, method: 'click' }, duty)
        await txs.createRefund(o.id, { amount: 10000, method: 'cash', comment: 'частичный возврат' }, manager)
        expect(row(o.id).paidAmount).toBe(80000)

        await orders.cancelOrder(o.id, 'Клиент передумал', duty.id)

        const r = row(o.id)
        expect(r.status).toBe('canceled')
        expect(r.cancelReason).toBe('Клиент передумал')
        expect(r.paidAmount).toBe(0)
        expect(r.paymentStatus).toBe('unpaid')
        const t = fake.table(TX).filter((x) => x.order === o.id)
        expect(t).toHaveLength(3)
        for (const x of t) {
            expect(x.status).toBe('cancelled')
            expect(x.cancelReason).toBe('Отмена заказа: Клиент передумал')
            expect(x.cancelledBy).toBe(duty.id)
        }
        const ev = events(o.id, 'status_changed').at(-1)!
        expect(ev.payload.to).toBe('canceled')
        expect(ev.payload.cancelledTransactions).toHaveLength(3)
    })

    it('после отмены нельзя принять оплату, повторно отменить; завершённый — нельзя отменить', async () => {
        const o = await createManual()
        await orders.cancelOrder(o.id, 'дубль', duty.id)
        await expect(txs.createPayment(o.id, { amount: 1000, method: 'cash' }, duty)).rejects.toThrow('ORDER_CANCELED')
        await expect(orders.cancelOrder(o.id, 'ещё раз', duty.id)).rejects.toThrow('ALREADY_CANCELED')

        const d = await createManual()
        row(d.id).status = 'done'
        await expect(orders.cancelOrder(d.id, 'поздно', duty.id)).rejects.toThrow('ORDER_DONE')
    })
})

describe('PUT /orders/:id (generic update) — защита', () => {
    function ctx(documentId: string, body: any, employee: any = duty) {
        const res: any = { status: 200, body: null }
        return Object.assign(res, {
            params: { id: documentId },
            request: { body: { data: body } },
            state: { employee },
            notFound: () => { res.status = 404 },
            badRequest: (m: string) => { res.status = 400; res.message = m },
            conflict: (m: string) => { res.status = 409; res.message = m },
        })
    }
    let ctrl: any
    beforeEach(() => { ctrl = (orderControllerFactory as any)({ strapi: fake.strapi }) })

    it('нельзя менять суммы и состав напрямую', async () => {
        const o = await createManual()
        const c = ctx(row(o.id).documentId, { total: 1 })
        await ctrl.update(c)
        expect(c.status).toBe(400)
        expect(c.message).toBe('USE_EDIT_ENDPOINT')
        expect(row(o.id).total).toBe(90000)
    })

    it('после подтверждения адрес не меняется', async () => {
        const o = await createManual()
        row(o.id).status = 'accepted'
        const c = ctx(row(o.id).documentId, { address: 'другой' })
        await ctrl.update(c)
        expect(c.status).toBe(409)
    })

    it('status=canceled через PUT идёт через отмену: без причины — 400, с причиной — сторно', async () => {
        const o = await createManual()
        await txs.createPayment(o.id, { amount: 90000, method: 'cash' }, duty)
        const c1 = ctx(row(o.id).documentId, { status: 'canceled' })
        await ctrl.update(c1)
        expect(c1.status).toBe(400)
        expect(row(o.id).status).toBe('new')

        const c2 = ctx(row(o.id).documentId, { status: 'canceled', cancelReason: 'нет курьеров' })
        await ctrl.update(c2)
        expect(c2.status).toBe(200)
        expect(row(o.id).status).toBe('canceled')
        expect(row(o.id).paidAmount).toBe(0)
    })

    it('завершить можно только полностью оплаченный заказ', async () => {
        const o = await createManual() // 90 000
        row(o.id).status = 'in_progress'
        const c1 = ctx(row(o.id).documentId, { status: 'done' })
        await ctrl.update(c1)
        expect(c1.status).toBe(409)
        expect(c1.message).toBe('ORDER_NOT_PAID')
        expect(row(o.id).status).toBe('in_progress')

        await txs.createPayment(o.id, { amount: 90000, method: 'cash' }, duty)
        const c2 = ctx(row(o.id).documentId, { status: 'done' })
        await ctrl.update(c2)
        expect(c2.status).toBe(200)
        expect(row(o.id).status).toBe('done')
    })

    it('отменённый заказ нельзя вернуть в работу', async () => {
        const o = await createManual()
        await orders.cancelOrder(o.id, 'дубль', duty.id)
        const c = ctx(row(o.id).documentId, { status: 'accepted' })
        await ctrl.update(c)
        expect(c.status).toBe(409)
        expect(row(o.id).status).toBe('canceled')
    })
})
