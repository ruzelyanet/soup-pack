import { describe, it, expect } from 'vitest'
import {
    getRealtimeBus, formatSseMessage, canReceive, ROLE_SCOPES,
    type EnvelopedEvent, type OrderSummary,
} from '../src/utils/realtime'

describe('canReceive / ROLE_SCOPES', () => {
    it('курьер видит orders и НЕ видит requests', () => {
        expect(canReceive('courier', 'orders')).toBe(true)
        expect(canReceive('courier', 'requests')).toBe(false)
    })
    it('manager и duty видят оба scope', () => {
        for (const role of ['manager', 'duty']) {
            expect(canReceive(role, 'orders')).toBe(true)
            expect(canReceive(role, 'requests')).toBe(true)
        }
    })
    it('неизвестная роль ничего не получает', () => {
        expect(canReceive('intern', 'orders')).toBe(false)
        expect(canReceive(null, 'requests')).toBe(false)
    })
    it('ROLE_SCOPES — объявлен и покрывает все три роли', () => {
        expect(Object.keys(ROLE_SCOPES).sort()).toEqual(['courier', 'duty', 'manager'])
    })
})

describe('order summary — PII hygiene', () => {
    const summary: OrderSummary = {
        id: 42, documentId: 'doc', code: 'SP-123',
        status: 'new', clientName: 'Азиз Каримов', itemsCount: 3, total: 124000,
        deliveryMethod: 'courier_now', deliverySlotAt: null,
        paymentMethod: 'click', source: 'catalog',
        createdAt: '2026-11-03T10:00:00.000Z',
    }

    it('формат SSE не содержит телефона, адреса и состава', () => {
        const env: EnvelopedEvent = {
            scope: 'orders', type: 'order.created', orderId: 42,
            summary, actorId: null, seq: 1, at: 'x',
        }
        const s = formatSseMessage(env)
        expect(s).toContain('"clientName":"Азиз Каримов"')
        expect(s).toContain('"itemsCount":3')
        expect(s).not.toMatch(/phone/i)
        expect(s).not.toMatch(/address/i)
        expect(s).not.toMatch(/items":\[/)
    })
})

describe('order events in bus', () => {
    it('order.updated c kind=status_changed доходит до подписчика', () => {
        const bus = getRealtimeBus()
        const got: EnvelopedEvent[] = []
        const off = bus.subscribe((e) => { if (e.scope === 'orders') got.push(e) })
        bus.publish({
            scope: 'orders', type: 'order.updated', orderId: 7,
            kind: 'status_changed', status: 'accepted', actorId: 1,
        })
        off()
        expect(got).toHaveLength(1)
        expect(got[0].type).toBe('order.updated')
        expect((got[0] as any).status).toBe('accepted')
    })

    it('scope-фильтр: подписчик orders игнорирует события requests', () => {
        const bus = getRealtimeBus()
        const orders: EnvelopedEvent[] = []
        const off = bus.subscribe((e) => {
            if (!canReceive('courier', e.scope)) return
            orders.push(e)
        })
        bus.publish({
            scope: 'requests', type: 'request.updated', requestId: 1, kind: 'patched', actorId: 1,
        })
        bus.publish({
            scope: 'orders', type: 'order.updated', orderId: 9,
            kind: 'payment', status: 'accepted', actorId: 1,
        })
        off()
        expect(orders).toHaveLength(1)
        expect(orders[0].scope).toBe('orders')
    })
})
