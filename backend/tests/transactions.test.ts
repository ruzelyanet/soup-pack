import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeStrapi } from './helpers/fake-strapi'

vi.mock('@strapi/strapi', () => ({
    factories: { createCoreService: (_uid: string, fn: any) => fn },
}))

import transactionFactory from '../src/api/transaction/services/transaction'

const TX = 'api::transaction.transaction'
const ORDER = 'api::order.order'

const manager = { id: 1, role: 'manager' as const }
const duty = { id: 2, role: 'duty' as const }
const courier = { id: 3, role: 'courier' as const }

let fake: ReturnType<typeof createFakeStrapi>
let svc: any

function order() {
    return fake.table(ORDER).find((o) => o.id === 10)!
}
function balance() {
    return fake.table(TX)
        .filter((t) => t.status === 'completed')
        .reduce((s, t) => s + (t.kind === 'payment' ? t.amount : -t.amount), 0)
}

beforeEach(() => {
    fake = createFakeStrapi()
    fake.register(ORDER, { logEvent: vi.fn(async () => {}) })
    fake.seed(ORDER, [{
        id: 10, total: 100000, paidAmount: 0, paymentStatus: 'unpaid', status: 'new',
        client: { id: 5 }, employee: { id: 3 },
    }])
    svc = (transactionFactory as any)({ strapi: fake.strapi })
})

describe('транзакции → paidAmount / paymentStatus заказа', () => {
    it('частичная оплата → partial, остаток верный', async () => {
        await svc.createPayment(10, { amount: 40000, method: 'cash' }, duty)
        expect(order().paidAmount).toBe(40000)
        expect(order().paymentStatus).toBe('partial')
    })

    it('две оплаты в сумме = total → paid', async () => {
        await svc.createPayment(10, { amount: 40000, method: 'cash' }, duty)
        await svc.createPayment(10, { amount: 60000, method: 'click' }, duty)
        expect(order().paidAmount).toBe(100000)
        expect(order().paymentStatus).toBe('paid')
    })

    it('дробная сумма округляется до сума', async () => {
        await svc.createPayment(10, { amount: 33333.6, method: 'card' }, duty)
        expect(order().paidAmount).toBe(33334)
    })

    it('переплата: duty — запрещено, manager без флага — запрещено, с allowOverpay → overpaid', async () => {
        await expect(svc.createPayment(10, { amount: 100001, method: 'cash' }, duty)).rejects.toThrow('AMOUNT_EXCEEDS_BALANCE')
        await expect(svc.createPayment(10, { amount: 100001, method: 'cash' }, manager)).rejects.toThrow('AMOUNT_EXCEEDS_BALANCE')
        await svc.createPayment(10, { amount: 120000, method: 'cash', allowOverpay: true }, manager)
        expect(order().paidAmount).toBe(120000)
        expect(order().paymentStatus).toBe('overpaid')
    })

    it('после полной оплаты новый платёж (без allowOverpay) отклоняется', async () => {
        await svc.createPayment(10, { amount: 100000, method: 'cash' }, duty)
        await expect(svc.createPayment(10, { amount: 1, method: 'cash' }, duty)).rejects.toThrow('AMOUNT_EXCEEDS_BALANCE')
    })

    it('частичный возврат уменьшает paidAmount', async () => {
        await svc.createPayment(10, { amount: 100000, method: 'cash' }, duty)
        await svc.createRefund(10, { amount: 30000, method: 'cash', comment: 'не тот суп' }, manager)
        expect(order().paidAmount).toBe(70000)
        expect(order().paymentStatus).toBe('partial')
    })

    it('полный возврат → refunded', async () => {
        await svc.createPayment(10, { amount: 100000, method: 'cash' }, duty)
        await svc.createRefund(10, { amount: 100000, method: 'cash', comment: 'отмена' }, manager)
        expect(order().paidAmount).toBe(0)
        expect(order().paymentStatus).toBe('refunded')
    })

    it('возврат больше оплаченного — отклоняется', async () => {
        await svc.createPayment(10, { amount: 50000, method: 'cash' }, duty)
        await expect(svc.createRefund(10, { amount: 50001, method: 'cash', comment: 'x' }, manager))
            .rejects.toThrow('AMOUNT_EXCEEDS_BALANCE')
    })

    it('возврат: только manager и только с причиной', async () => {
        await svc.createPayment(10, { amount: 50000, method: 'cash' }, duty)
        await expect(svc.createRefund(10, { amount: 1, method: 'cash', comment: 'x' }, duty)).rejects.toThrow('FORBIDDEN_ROLE')
        await expect(svc.createRefund(10, { amount: 1, method: 'cash', comment: '  ' }, manager)).rejects.toThrow('reason required')
    })

    it('сторно платежа возвращает заказ в unpaid', async () => {
        const p = await svc.createPayment(10, { amount: 100000, method: 'cash' }, duty)
        await svc.cancelOne(p.id, { reason: 'ошибка кассира' }, manager)
        expect(order().paidAmount).toBe(0)
        expect(order().paymentStatus).toBe('unpaid')
        await expect(svc.cancelOne(p.id, { reason: 'ещё раз' }, manager)).rejects.toThrow('ALREADY_CANCELLED')
    })

    it('сторно возврата возвращает сумму обратно в оплату', async () => {
        await svc.createPayment(10, { amount: 100000, method: 'cash' }, duty)
        const r = await svc.createRefund(10, { amount: 40000, method: 'cash', comment: 'x' }, manager)
        await svc.cancelOne(r.id, { reason: 'возврат не делали' }, manager)
        expect(order().paidAmount).toBe(100000)
        expect(order().paymentStatus).toBe('paid')
    })

    it('сторно платежа, по которому уже был возврат, не должно «съедать» следующую оплату', async () => {
        // оплатили 100к → вернули 100к → по ошибке сторнировали исходный платёж → клиент снова платит 100к
        const p = await svc.createPayment(10, { amount: 100000, method: 'cash' }, duty)
        await svc.createRefund(10, { amount: 100000, method: 'cash', comment: 'отмена' }, manager)
        try { await svc.cancelOne(p.id, { reason: 'ошибка' }, manager) } catch { /* отказ — тоже корректно */ }
        try { await svc.createPayment(10, { amount: 100000, method: 'cash' }, duty) } catch { /* */ }
        // Деньги в кассе по completed-транзакциям должны совпадать с paidAmount заказа.
        expect(order().paidAmount).toBe(balance())
    })

    it('идемпотентность: повтор с тем же ключом не создаёт вторую оплату', async () => {
        const a = await svc.createPayment(10, { amount: 30000, method: 'payme', idempotencyKey: 'k1' }, duty)
        const b = await svc.createPayment(10, { amount: 30000, method: 'payme', idempotencyKey: 'k1' }, duty)
        expect(b.id).toBe(a.id)
        expect(fake.table(TX)).toHaveLength(1)
        expect(order().paidAmount).toBe(30000)
    })

    it('валидация суммы и метода', async () => {
        await expect(svc.createPayment(10, { amount: 0, method: 'cash' }, duty)).rejects.toThrow('positive')
        await expect(svc.createPayment(10, { amount: -5, method: 'cash' }, duty)).rejects.toThrow('positive')
        await expect(svc.createPayment(10, { amount: NaN, method: 'cash' }, duty)).rejects.toThrow('amount is required')
        await expect(svc.createPayment(10, { amount: 10, method: 'bitcoin' as any }, duty)).rejects.toThrow('invalid method')
    })

    it('отменённый заказ нельзя оплатить', async () => {
        order().status = 'canceled'
        await expect(svc.createPayment(10, { amount: 10, method: 'cash' }, duty)).rejects.toThrow('ORDER_CANCELED')
    })

    it('курьер: только свой заказ и только receivedBy = он', async () => {
        await svc.createPayment(10, { amount: 10000, method: 'cash' }, courier)
        await expect(svc.createPayment(10, { amount: 10000, method: 'cash', receivedById: 99 }, courier)).rejects.toThrow('FORBIDDEN_ROLE')
        order().employee = { id: 77 }
        await expect(svc.createPayment(10, { amount: 10000, method: 'cash' }, courier)).rejects.toThrow('FORBIDDEN_ROLE')
    })

    it('инвариант на случайной последовательности: paidAmount = max(0, Σплатежей − Σвозвратов) по completed', async () => {
        let seed = 42
        const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
        for (let i = 0; i < 60; i++) {
            const r = rnd()
            try {
                if (r < 0.5) await svc.createPayment(10, { amount: Math.ceil(rnd() * 40000), method: 'cash' }, duty)
                else if (r < 0.75) await svc.createRefund(10, { amount: Math.ceil(rnd() * 40000), method: 'cash', comment: 'x' }, manager)
                else {
                    const live = fake.table(TX).filter((t) => t.status === 'completed')
                    if (live.length) await svc.cancelOne(live[Math.floor(rnd() * live.length)].id, { reason: 'r' }, manager)
                }
            } catch { /* бизнес-отказы допустимы */ }
            expect(order().paidAmount).toBe(Math.max(0, balance()))
            expect(order().paidAmount).toBeLessThanOrEqual(order().total)
        }
    })
})
