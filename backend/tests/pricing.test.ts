import { describe, it, expect } from 'vitest'
import {
    allocate,
    evaluate,
    type DiscountSnapshot,
    type CartLineSnapshot,
    type QuoteContext,
} from '../src/api/price/services/pricing'

// ────── Helpers ──────

const ctx = (over: Partial<QuoteContext> = {}): QuoteContext => ({
    deliveryMethod: 'courier_now',
    paymentMethod: 'card',
    clientKind: 'individual',
    source: 'catalog',
    at: new Date('2026-06-15T10:00:00+05:00'), // Пн, 10:00 Tashkent
    ...over,
})

const line = (over: Partial<CartLineSnapshot> = {}): CartLineSnapshot => ({
    lineKey: 'L1', productId: 1, categoryId: 10, name: 'tom-yam',
    qty: 1, basePrice: 50000, priceId: null, orderSetId: null, setInstance: null,
    ...over,
})

const discount = (over: Partial<DiscountSnapshot> = {}): DiscountSnapshot => ({
    id: 1, version: 1, name: 'd', publicLabel: null,
    level: 'line', benefitType: 'percent', benefitValue: 10,
    priority: 100, stackable: true, exclusiveGroup: null,
    conditions: null, targets: [{ targetType: 'all-products' }],
    ...over,
})

// ───────────────────────── allocate ─────────────────────────

describe('allocate', () => {
    it('sum of shares equals input amount', () => {
        const shares = allocate(1000, [300, 500, 200])
        expect(shares.reduce((s, x) => s + x, 0)).toBe(1000)
    })

    it('remainder goes to the largest base', () => {
        const shares = allocate(10, [1, 1, 1])  // 3 → 3 → 1 остаток
        // Все равны → остаток первой: индексы одинаковые, сортировка по убыв. базы стабильна.
        expect(shares.reduce((s, x) => s + x, 0)).toBe(10)
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
    })

    it('zero amount gives zero shares', () => {
        expect(allocate(0, [1, 2, 3])).toEqual([0, 0, 0])
    })

    it('single row takes full amount', () => {
        expect(allocate(42, [10])).toEqual([42])
    })

    it('zero bases → zero shares', () => {
        expect(allocate(100, [0, 0, 0])).toEqual([0, 0, 0])
    })

    it('empty bases → empty shares', () => {
        expect(allocate(100, [])).toEqual([])
    })
})

// ───────────────────────── evaluate ─────────────────────────

describe('evaluate — line discounts', () => {
    it('percent discount applies and respects target product', () => {
        const q = evaluate([line({ productId: 1, basePrice: 50000, qty: 2 })],
            [discount({ benefitValue: 20, targets: [{ targetType: 'product', productId: 1 }] })],
            ctx())
        expect(q.lines[0].unitPrice).toBe(40000)
        expect(q.lines[0].lineTotal).toBe(80000)
        expect(q.discountTotal).toBe(20000) // 2×10000
    })

    it('fixed_amount reduces unit price', () => {
        const q = evaluate([line({ basePrice: 20000 })],
            [discount({ benefitType: 'fixed_amount', benefitValue: 5000 })],
            ctx())
        expect(q.lines[0].unitPrice).toBe(15000)
    })

    it('fixed_price overrides unit price', () => {
        const q = evaluate([line({ basePrice: 50000 })],
            [discount({ benefitType: 'fixed_price', benefitValue: 30000 })],
            ctx())
        expect(q.lines[0].unitPrice).toBe(30000)
    })

    it('category target with exclude on product does not apply', () => {
        const q = evaluate([line({ productId: 7, categoryId: 10, basePrice: 10000 })],
            [discount({ benefitValue: 50, targets: [
                { targetType: 'category', categoryId: 10 },
                { targetType: 'product', productId: 7, exclude: true },
            ]})],
            ctx())
        expect(q.lines[0].unitPrice).toBe(10000)
        expect(q.discountTotal).toBe(0)
    })

    it('exclusiveGroup picks biggest benefit', () => {
        const q = evaluate([line({ basePrice: 10000 })],
            [
                discount({ id: 1, benefitValue: 10, exclusiveGroup: 'g', priority: 50 }),
                discount({ id: 2, benefitValue: 30, exclusiveGroup: 'g', priority: 100 }),
            ],
            ctx())
        expect(q.lines[0].unitPrice).toBe(7000) // 10000 * 0.70
        expect(q.lines[0].discounts.length).toBe(1)
        expect(q.lines[0].discounts[0].discountId).toBe(2)
    })

    it('stackable=false → only the biggest applies', () => {
        const q = evaluate([line({ basePrice: 10000 })],
            [
                discount({ id: 1, benefitValue: 10, stackable: false }),
                discount({ id: 2, benefitValue: 20, stackable: true }),
            ],
            ctx())
        expect(q.lines[0].discounts.length).toBe(1)
        expect(q.lines[0].discounts[0].discountId).toBe(2)
        expect(q.lines[0].unitPrice).toBe(8000)
    })

    it('discount outside its period is not loaded (evaluate works on pre-filtered list)', () => {
        // evaluate доверяет вызывающему, что все переданные скидки активны — факт
        // проверяется в loadActiveDiscounts. Здесь проверим: если скидка вообще не передана,
        // ничего не применяется.
        const q = evaluate([line({ basePrice: 10000 })], [], ctx())
        expect(q.discountTotal).toBe(0)
    })

    it('price never drops below 1 per unit', () => {
        const q = evaluate([line({ basePrice: 100 })],
            [discount({ benefitType: 'fixed_amount', benefitValue: 200 })],
            ctx())
        expect(q.lines[0].unitPrice).toBe(1)
    })

    it('weekday condition in Asia/Tashkent', () => {
        // 2026-06-15 — понедельник
        const q = evaluate([line({ basePrice: 10000 })],
            [discount({ conditions: { weekdays: [1] }, benefitValue: 10 })],
            ctx({ at: new Date('2026-06-15T10:00:00+05:00') }))
        expect(q.discountTotal).toBeGreaterThan(0)

        // 2026-06-14 — воскресенье (7)
        const q2 = evaluate([line({ basePrice: 10000 })],
            [discount({ conditions: { weekdays: [1] }, benefitValue: 10 })],
            ctx({ at: new Date('2026-06-14T10:00:00+05:00') }))
        expect(q2.discountTotal).toBe(0)
    })

    it('timeFrom/timeTo in Asia/Tashkent', () => {
        const d = discount({ conditions: { timeFrom: '10:00', timeTo: '14:00' }, benefitValue: 20 })
        const inside = evaluate([line({ basePrice: 10000 })], [d], ctx({ at: new Date('2026-06-15T11:30:00+05:00') }))
        expect(inside.discountTotal).toBe(2000)
        const outside = evaluate([line({ basePrice: 10000 })], [d], ctx({ at: new Date('2026-06-15T16:00:00+05:00') }))
        expect(outside.discountTotal).toBe(0)
    })

    it('maxDiscountAmount caps order-level discount', () => {
        const q = evaluate([line({ basePrice: 100000, qty: 1 })],
            [discount({ level: 'order', benefitValue: 50, maxDiscountAmount: 1000, targets: [] })],
            ctx())
        expect(q.discountTotal).toBe(1000)
    })
})

describe('evaluate — set discount (товар в наборе получает ТОЛЬКО скидку набора, docs/pricing-and-discounts.md §вопрос 1)', () => {
    it('set percent ignores product discount for set lines', () => {
        const cart: CartLineSnapshot[] = [
            line({ productId: 1, basePrice: 50000, qty: 1, orderSetId: 100, setInstance: '100-1' }),
            line({ lineKey: 'L2', productId: 2, basePrice: 30000, qty: 1, orderSetId: 100, setInstance: '100-1' }),
        ]
        const discounts: DiscountSnapshot[] = [
            discount({ id: 11, level: 'line', benefitValue: 10, targets: [{ targetType: 'product', productId: 1 }] }),  // 50000 → 45000
            discount({ id: 12, level: 'set', benefitValue: 20, targets: [{ targetType: 'order-set', orderSetId: 100 }] }), // line-скидка игнорируется: −20% от 50000+30000=80000 → 64000
        ]
        const q = evaluate(cart, discounts, ctx())
        // Инвариант: subtotal (100% base) - discountTotal = total.
        expect(q.subtotal).toBe(80000)
        expect(q.total).toBe(64000)
        expect(q.discountTotal).toBe(16000)
    })

    it('set stackable=false: line-скидка на строку набора не применяется', () => {
        const cart: CartLineSnapshot[] = [
            line({ productId: 1, basePrice: 50000, qty: 1, orderSetId: 100, setInstance: '100-1' }),
        ]
        const discounts: DiscountSnapshot[] = [
            discount({ id: 11, level: 'line', benefitValue: 10, targets: [{ targetType: 'product', productId: 1 }] }),
            discount({ id: 12, level: 'set', benefitValue: 20, stackable: false, targets: [{ targetType: 'order-set', orderSetId: 100 }] }),
        ]
        const q = evaluate(cart, discounts, ctx())
        // 50000 → line пропущена → 40000 (set 20%)
        expect(q.lines[0].unitPrice).toBe(40000)
    })
})

describe('evaluate — order-level tiered discount', () => {
    it('cart-tier picks the biggest percent in exclusiveGroup', () => {
        const cart = [line({ basePrice: 150000 })]
        const discounts: DiscountSnapshot[] = [
            discount({ id: 1, level: 'order', benefitValue: 5, conditions: { minSubtotal: 100000 }, exclusiveGroup: 'cart-tier', targets: [] }),
            discount({ id: 2, level: 'order', benefitValue: 10, conditions: { minSubtotal: 100000 }, exclusiveGroup: 'cart-tier', targets: [] }),
            discount({ id: 3, level: 'order', benefitValue: 15, conditions: { minSubtotal: 200000 }, exclusiveGroup: 'cart-tier', targets: [] }),
        ]
        const q = evaluate(cart, discounts, ctx())
        expect(q.discountTotal).toBe(15000) // 10% от 150000
        expect(q.hints.length).toBe(1)
        expect(q.hints[0].missing).toBe(50000) // до 15% ещё 50 000
    })

    it('invariant: subtotal − discountTotal = total = Σ lineTotal', () => {
        const cart = [line({ basePrice: 55555, qty: 3 })]
        const discounts: DiscountSnapshot[] = [
            discount({ level: 'order', benefitValue: 7, targets: [] }),
        ]
        const q = evaluate(cart, discounts, ctx())
        expect(q.subtotal - q.discountTotal).toBe(q.total)
        expect(q.lines.reduce((s, l) => s + l.lineTotal, 0)).toBe(q.total)
    })
})
