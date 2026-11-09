/**
 * Сквозной расчёт заказа: корзина → pricing.quote (реальный) → order.buildAndCreate (реальный)
 * → итоги заказа, строки, order-discount → оплата транзакциями. БД — in-memory заглушка.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeStrapi } from './helpers/fake-strapi'

vi.mock('@strapi/strapi', () => ({
    factories: { createCoreService: (_uid: string, fn: any) => fn },
}))

import pricingFactory from '../src/api/price/services/pricing'
import orderFactory from '../src/api/order/services/order'
import transactionFactory from '../src/api/transaction/services/transaction'

const PRODUCT = 'api::product.product'
const ORDER_SET = 'api::order-set.order-set'
const DISCOUNT = 'api::discount.discount'
const ORDER = 'api::order.order'
const ORDER_DISCOUNT = 'api::order-discount.order-discount'

let fake: ReturnType<typeof createFakeStrapi>
let orders: any
let txs: any
let pricing: any

const soups = { id: 10 }
const drinks = { id: 20 }

beforeEach(() => {
    fake = createFakeStrapi()
    pricing = (pricingFactory as any)({ strapi: fake.strapi })
    orders = (orderFactory as any)({ strapi: fake.strapi })
    txs = (transactionFactory as any)({ strapi: fake.strapi })
    fake.register('api::price.pricing', pricing)
    fake.register(ORDER, orders)
    fake.register('api::transaction.transaction', txs)

    fake.seed(PRODUCT, [
        { id: 1, name: 'Том-ям', price: 50000, available: true, category: soups },
        { id: 2, name: 'Борщ', price: 30000, available: true, category: soups },
        { id: 3, name: 'Морс', price: 12000, available: true, category: drinks },
        { id: 4, name: 'Снято', price: 10000, available: false, category: drinks },
    ])
    fake.seed(ORDER_SET, [{
        id: 100, name: 'Обед',
        items: [
            { qty: 1, product: { id: 1, name: 'Том-ям', category: soups } },
            { qty: 1, product: { id: 3, name: 'Морс', category: drinks } },
        ],
    }])
})

const disc = (over: any) => ({
    status: 'active', version: 1, name: 'd', level: 'line', benefitType: 'percent',
    benefitValue: 10, priority: 100, stackable: true, exclusiveGroup: null, conditions: null,
    targets: [{ targetType: 'all-products' }], ...over,
})

const client = { fullName: 'Тест', phone: '+998 90 123 45 67' }

async function place(items: any[]) {
    return orders.buildAndCreate({ client, items, paymentMethod: 'cash' }, { source: 'catalog' })
}

function assertOrderInvariants(o: any) {
    const lines = o.items as any[]
    // subtotal = Σ base × qty
    expect(o.subtotal).toBe(lines.reduce((s, l) => s + l.basePrice * l.qty, 0))
    // total = Σ lineTotal, lineTotal = unitPrice × qty − orderDiscountAmount
    for (const l of lines) expect(l.lineTotal).toBe(l.unitPrice * l.qty - l.orderDiscountAmount)
    expect(o.total).toBe(lines.reduce((s, l) => s + l.lineTotal, 0))
    expect(o.subtotal - o.discountTotal).toBe(o.total)
    // Отчётные записи order-discount в сумме = discountTotal
    const od = fake.table(ORDER_DISCOUNT).filter((r) => r.order === o.id)
    expect(od.reduce((s, r) => s + r.amount, 0)).toBe(o.discountTotal)
}

describe('заказ: итоги без скидок', () => {
    it('цены берутся из БД, а не из тела запроса; одинаковые товары склеиваются', async () => {
        const o = await place([
            { type: 'product', productId: 1, qty: 2, price: 1 },
            { type: 'product', productId: 2, qty: 1 },
            { type: 'product', productId: 1, qty: 1 },
        ])
        expect(o.subtotal).toBe(50000 * 3 + 30000)
        expect(o.total).toBe(180000)
        expect(o.discountTotal).toBe(0)
        expect(o.items).toHaveLength(2)
        expect(o.paymentStatus).toBe('unpaid')
        expect(o.paidAmount).toBe(0)
        assertOrderInvariants(o)
    })

    it('недоступный товар — ошибка', async () => {
        await expect(place([{ type: 'product', productId: 4, qty: 1 }])).rejects.toThrow('unavailable')
    })

    it('dryRun совпадает с реальным созданием', async () => {
        fake.seed(DISCOUNT, [disc({ id: 1, benefitValue: 15 })])
        const items = [{ type: 'product', productId: 1, qty: 2 }, { type: 'product', productId: 3, qty: 1 }]
        const dry = await orders.buildAndCreate({ client, items }, { source: 'catalog', dryRun: true })
        const real = await place(items)
        expect(real.total).toBe(dry.total)
        expect(real.subtotal).toBe(dry.subtotal)
        expect(real.discountTotal).toBe(dry.discountTotal)
    })
})

describe('заказ: скидки', () => {
    it('скидка на товар 10%', async () => {
        fake.seed(DISCOUNT, [disc({ id: 1, targets: [{ targetType: 'product', product: { id: 1 } }] })])
        const o = await place([{ type: 'product', productId: 1, qty: 2 }, { type: 'product', productId: 2, qty: 1 }])
        expect(o.total).toBe(45000 * 2 + 30000)
        expect(o.discountTotal).toBe(10000)
        assertOrderInvariants(o)
    })

    it('скидка на категорию с исключением товара', async () => {
        fake.seed(DISCOUNT, [disc({ id: 1, benefitValue: 20, targets: [
            { targetType: 'category', category: soups },
            { targetType: 'product', product: { id: 2 }, exclude: true },
        ] })])
        const o = await place([{ type: 'product', productId: 1, qty: 1 }, { type: 'product', productId: 2, qty: 1 }])
        expect(o.total).toBe(40000 + 30000)
        assertOrderInvariants(o)
    })

    it('скидка на чек распределяется по строкам без потери копейки', async () => {
        fake.seed(DISCOUNT, [disc({ id: 1, level: 'order', benefitValue: 7, targets: [] })])
        const o = await place([
            { type: 'product', productId: 1, qty: 1 },
            { type: 'product', productId: 2, qty: 1 },
            { type: 'product', productId: 3, qty: 1 },
        ])
        // 7% от 92000 = 6440
        expect(o.discountTotal).toBe(6440)
        expect(o.total).toBe(92000 - 6440)
        expect(o.cartDiscountPercent).toBe(7)
        expect(o.cartDiscountAmount).toBe(6440)
        assertOrderInvariants(o)
    })

    it('скидка на товар + скидка на чек: чек считается от цены после товарной', async () => {
        fake.seed(DISCOUNT, [
            disc({ id: 1, benefitValue: 10, targets: [{ targetType: 'product', product: { id: 1 } }] }),
            disc({ id: 2, level: 'order', benefitValue: 5, targets: [] }),
        ])
        const o = await place([{ type: 'product', productId: 1, qty: 2 }])
        // 50000 → 45000 ×2 = 90000 → −5% = 85500
        expect(o.total).toBe(85500)
        expect(o.discountTotal).toBe(14500)
        assertOrderInvariants(o)
    })
})

describe('заказ: наборы', () => {
    it('набор ×1 со скидкой набора 20%', async () => {
        fake.seed(DISCOUNT, [disc({ id: 1, level: 'set', benefitValue: 20, targets: [{ targetType: 'order-set', orderSet: { id: 100 } }] })])
        const o = await place([{ type: 'set', orderSetId: 100, qty: 1 }])
        // (50000 + 12000) × 0.8 = 49600
        expect(o.subtotal).toBe(62000)
        expect(o.total).toBe(49600)
        assertOrderInvariants(o)
    })

    it('набор ×2 — в заказе должно быть два комплекта', async () => {
        const o = await place([{ type: 'set', orderSetId: 100, qty: 2 }])
        expect(o.subtotal).toBe(62000 * 2)
        expect(o.total).toBe(124000)
    })

    it('сумма заказа совпадает с /pricing/quote, который видит клиент на чекауте', async () => {
        fake.seed(DISCOUNT, [disc({ id: 1, level: 'set', benefitValue: 20, targets: [{ targetType: 'order-set', orderSet: { id: 100 } }] })])
        const items = [{ type: 'set', orderSetId: 100, qty: 3 }, { type: 'product', productId: 2, qty: 1 }]
        const shown = await pricing.quote({ items, source: 'catalog' })
        const o = await place(items)
        expect(o.total).toBe(shown.total)
    })
})

describe('заказ → оплата', () => {
    it('заказ со скидкой оплачивается ровно на total → paid', async () => {
        fake.seed(DISCOUNT, [disc({ id: 1, level: 'order', benefitValue: 7, targets: [] })])
        const o = await place([{ type: 'product', productId: 1, qty: 1 }, { type: 'product', productId: 3, qty: 1 }])
        o.status = 'new'
        await txs.createPayment(o.id, { amount: o.total, method: 'cash' }, { id: 1, role: 'duty' })
        const saved = fake.table(ORDER).find((r) => r.id === o.id)!
        expect(saved.paidAmount).toBe(o.total)
        expect(saved.paymentStatus).toBe('paid')
    })
})
