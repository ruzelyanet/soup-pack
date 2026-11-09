import { describe, it, expect } from 'vitest'
import { buildOrderStages, historyLineLabel, stageChip } from './orderFlow'

const T0 = '2026-11-03T10:00:00.000Z'
const T1 = '2026-11-03T10:05:00.000Z'
const T2 = '2026-11-03T10:30:00.000Z'
const T3 = '2026-11-03T11:00:00.000Z'
const T4 = '2026-11-03T11:30:00.000Z'
const NOW = new Date('2026-11-03T12:00:00.000Z')

const AZIZ = { id: 7, fullName: 'Азиз' }

const base = {
    id: 1, status: 'new' as const, createdAt: T0, source: 'catalog' as const,
    cancelReason: null as string | null, employee: null as any,
    deliveryMethod: 'courier_now' as const, deliverySlotAt: null, paymentMethod: 'cash',
}

describe('buildOrderStages', () => {
    it('только что создан: current = taken', () => {
        const stages = buildOrderStages(base, [], NOW)
        expect(stages.map((s) => s.state)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
        expect(stages[1].action?.kind).toBe('take')
    })

    it('после take: taken done, current = confirmed, employee в акторе', () => {
        const stages = buildOrderStages(
            { ...base, employee: AZIZ },
            [{ id: 1, kind: 'taken', actor: AZIZ, publishedAt: T1 }],
            NOW,
        )
        expect(stages[1].state).toBe('done')
        expect(stages[1].actor?.id).toBe(7)
        expect(stages[2].state).toBe('current')
        expect(stages[2].action?.kind).toBe('confirm')
    })

    it('status accepted → confirmed done, current = in_progress; fallback: при отсутствии события confirmed время берётся из taken', () => {
        const stages = buildOrderStages(
            { ...base, status: 'accepted', employee: AZIZ },
            [{ id: 1, kind: 'taken', actor: AZIZ, publishedAt: T1 }],
            NOW,
        )
        expect(stages[2].state).toBe('done')
        expect(stages[2].at).toBe(T1)
        expect(stages[3].state).toBe('current')
    })

    it('отмена на этапе confirmed: done остаются done, confirmed canceled, дальше skipped', () => {
        const stages = buildOrderStages(
            { ...base, status: 'canceled', employee: AZIZ, cancelReason: 'нет товара' },
            [
                { id: 1, kind: 'taken', actor: AZIZ, publishedAt: T1 },
                { id: 2, kind: 'status_changed', payload: { from: 'new', to: 'canceled', cancelReason: 'нет товара' }, publishedAt: T2 },
            ],
            NOW,
        )
        expect(stages.map((s) => s.state)).toEqual(['done', 'done', 'canceled', 'skipped', 'skipped', 'skipped'])
    })

    it('полный пробег: все done, durationMin посчитан', () => {
        const stages = buildOrderStages(
            { ...base, status: 'done', employee: AZIZ, total: 100000, paidAmount: 100000, paymentStatus: 'paid' },
            [
                { id: 1, kind: 'taken', actor: AZIZ, publishedAt: T1 },
                { id: 2, kind: 'status_changed', payload: { from: 'new', to: 'accepted' }, publishedAt: T2 },
                { id: 3, kind: 'status_changed', payload: { from: 'accepted', to: 'in_progress' }, publishedAt: T3 },
                { id: 4, kind: 'status_changed', payload: { from: 'in_progress', to: 'done' }, publishedAt: T4 },
            ],
            NOW,
        )
        expect(stages.every((s) => s.state === 'done')).toBe(true)
        expect(stages[0].durationMin).toBe(5)   // T0 → T1
        expect(stages[1].durationMin).toBe(25)  // T1 → T2
        expect(stages[2].durationMin).toBe(30)  // T2 → T3
        expect(stages[3].durationMin).toBe(30)  // T3 → T4
    })

    it('этап «Оплачен» стоит перед «Завершён»', () => {
        const stages = buildOrderStages(base, [], NOW)
        expect(stages.map((s) => s.key)).toEqual(['created', 'taken', 'confirmed', 'in_progress', 'paid', 'done'])
        expect(stages[4].title).toBe('Оплачен')
    })

    it('в доставке и не оплачен: текущий этап — «Оплачен» с кнопкой «Принять оплату», остаток в описании', () => {
        const stages = buildOrderStages(
            { ...base, status: 'in_progress', employee: AZIZ, total: 100000, paidAmount: 30000, paymentStatus: 'partial' },
            [
                { id: 1, kind: 'taken', actor: AZIZ, publishedAt: T1 },
                { id: 2, kind: 'status_changed', payload: { to: 'accepted' }, publishedAt: T2 },
                { id: 3, kind: 'status_changed', payload: { to: 'in_progress' }, publishedAt: T3 },
            ],
            NOW,
        )
        const paid = stages.find((s) => s.key === 'paid')!
        expect(paid.state).toBe('current')
        expect(paid.action?.kind).toBe('pay')
        expect(paid.description).toMatch(/остаток 70[\s\u00a0]000 сум/)
        expect(paid.durationMin).toBe(60) // с T3 (передан в работу) до NOW
        expect(stages.find((s) => s.key === 'done')!.state).toBe('upcoming')
    })

    it('оплачен полностью в доставке: «Оплачен» пройден, текущий — «Завершён»', () => {
        const PAYER = { id: 9, fullName: 'Курьер' }
        const stages = buildOrderStages(
            { ...base, status: 'in_progress', employee: AZIZ, total: 100000, paidAmount: 100000, paymentStatus: 'paid' },
            [
                { id: 1, kind: 'taken', actor: AZIZ, publishedAt: T1 },
                { id: 2, kind: 'status_changed', payload: { to: 'accepted' }, publishedAt: T2 },
                { id: 3, kind: 'status_changed', payload: { to: 'in_progress' }, publishedAt: T3 },
                { id: 4, kind: 'payment', actor: PAYER, payload: { amount: 100000 }, publishedAt: T4 },
            ],
            NOW,
        )
        const paid = stages.find((s) => s.key === 'paid')!
        expect(paid.state).toBe('done')
        expect(paid.actor?.id).toBe(9)
        expect(paid.at).toBe(T4)
        expect(stages.find((s) => s.key === 'done')!.action?.kind).toBe('finish')
    })

    it('предоплата до подтверждения: «Оплачен» уже пройден, текущий — «Подтверждён клиентом»', () => {
        const stages = buildOrderStages(
            { ...base, employee: AZIZ, total: 50000, paidAmount: 50000, paymentStatus: 'paid' },
            [{ id: 1, kind: 'taken', actor: AZIZ, publishedAt: T1 }],
            NOW,
        )
        expect(stages.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'done', 'upcoming'])
        expect(stages[1].durationMin).toBe(null) // следующий пройденный в цепочке ещё не наступил
    })
})

describe('historyLineLabel', () => {
    it('status_changed → canceled берёт cancelReason из payload', () => {
        const line = historyLineLabel(
            { id: 1, kind: 'status_changed', payload: { to: 'canceled', cancelReason: 'не дозвонились' } },
            { cancelReason: null },
        )
        expect(line.title).toBe('Отменён')
        expect(line.detail).toBe('не дозвонились')
    })
    it('payment показывает сумму и метод', () => {
        const line = historyLineLabel(
            { id: 1, kind: 'payment', payload: { amount: 50000, method: 'cash' } },
            { cancelReason: null },
        )
        // ru-RU Intl.NumberFormat ставит неразрывный пробел (U+00A0), не ASCII.
        expect(line.title).toMatch(/50[\s ]000/)
        expect(line.detail).toBe('cash')
    })
    it('taken — короткое название', () => {
        const line = historyLineLabel({ id: 1, kind: 'taken' }, { cancelReason: null })
        expect(line.title).toBe('Взят в работу')
    })
    it('taken auto — заказ закреплён за создателем', () => {
        const line = historyLineLabel({ id: 1, kind: 'taken', payload: { employeeId: 7, auto: true } }, { cancelReason: null })
        expect(line.detail).toBe('создатель заказа')
    })
    it('updated — человеческие названия полей и изменение итога', () => {
        const line = historyLineLabel(
            { id: 1, kind: 'updated', payload: { fields: ['items', 'address'], totalBefore: 90000, totalAfter: 135000 } },
            { cancelReason: null },
        )
        expect(line.title).toBe('Изменён состав заказа')
        expect(line.detail).toMatch(/^состав, адрес · итог 90[\s\u00a0]000 сум → 135[\s\u00a0]000 сум$/)
    })
    it('отмена — причина и число сторнированных транзакций', () => {
        const line = historyLineLabel(
            { id: 1, kind: 'status_changed', payload: { to: 'canceled', cancelReason: 'дубль', cancelledTransactions: ['TX-1', 'TX-2'] } },
            { cancelReason: null },
        )
        expect(line.title).toBe('Отменён')
        expect(line.detail).toBe('дубль · сторнировано транзакций: 2')
    })
})

describe('stageChip', () => {
    it('new без сотрудника — «Новый», с сотрудником — «Взят в работу»', () => {
        expect(stageChip({ status: 'new' }).label).toBe('Новый')
        expect(stageChip({ status: 'new', employee: { id: 1 } }).label).toBe('Взят в работу')
        expect(stageChip({ status: 'canceled' }).label).toBe('Отменён')
    })
})
