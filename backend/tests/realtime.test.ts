import { describe, it, expect } from 'vitest'
import { getRealtimeBus, formatSseMessage, type EnvelopedEvent } from '../src/utils/realtime'

describe('realtime bus', () => {
    it('publish доходит до подписчика; seq растёт монотонно', () => {
        const bus = getRealtimeBus()
        const got: EnvelopedEvent[] = []
        const off = bus.subscribe((e) => got.push(e))
        bus.publish({ type: 'request.updated', requestId: 1, kind: 'patched', actorId: 7 })
        bus.publish({ type: 'request.reordered', columnId: 2, actorId: 7 })
        off()
        bus.publish({ type: 'request.updated', requestId: 1, kind: 'moved', actorId: 7 })
        expect(got).toHaveLength(2)
        expect(got[1].seq).toBe(got[0].seq + 1)
    })

    it('отписка перестаёт получать события', () => {
        const bus = getRealtimeBus()
        let n = 0
        const off = bus.subscribe(() => n++)
        const before = bus.lastSeq
        bus.publish({ type: 'request.updated', requestId: 1, kind: 'patched', actorId: null })
        off()
        bus.publish({ type: 'request.updated', requestId: 1, kind: 'patched', actorId: null })
        expect(n).toBe(1)
        expect(bus.lastSeq).toBe(before + 2) // seq тикает независимо от подписчиков
    })
})

describe('formatSseMessage', () => {
    it('кодирует id/event/data и завершает пустой строкой', () => {
        const env: EnvelopedEvent = {
            type: 'request.updated', requestId: 42, kind: 'moved', actorId: 1,
            seq: 123, at: '2026-11-03T10:00:00.000Z',
        }
        const s = formatSseMessage(env)
        expect(s.startsWith('id: 123\n')).toBe(true)
        expect(s).toContain('event: request.updated\n')
        expect(s).toContain('"requestId":42')
        expect(s).toContain('"kind":"moved"')
        expect(s.endsWith('\n\n')).toBe(true)
    })

    it('request.created несёт summary без телефона', () => {
        const env: EnvelopedEvent = {
            type: 'request.created', requestId: 10, actorId: null, seq: 1, at: 'x',
            summary: {
                id: 10, code: 'RQ-000010', type: 'individual', name: 'Азиз',
                source: 'form', sourceDetail: 'Заказ обеда', createdAt: 'x',
            },
        }
        const s = formatSseMessage(env)
        expect(s).toContain('"summary"')
        expect(s).not.toContain('phone')
    })
})
