import { describe, it, expect } from 'vitest'
import { canTransition, checkReadiness, displayState, STATUS_TRANSITIONS } from '../src/api/discount/lifecycle'

describe('STATUS_TRANSITIONS', () => {
    it('matrix: draft → active, archived', () => {
        expect(canTransition('draft', 'active')).toBe(true)
        expect(canTransition('draft', 'archived')).toBe(true)
        expect(canTransition('draft', 'paused')).toBe(false)
    })

    it('matrix: active → paused, archived; not back to draft', () => {
        expect(canTransition('active', 'paused')).toBe(true)
        expect(canTransition('active', 'archived')).toBe(true)
        expect(canTransition('active', 'draft')).toBe(false)
    })

    it('matrix: paused → active, archived', () => {
        expect(canTransition('paused', 'active')).toBe(true)
        expect(canTransition('paused', 'archived')).toBe(true)
        expect(canTransition('paused', 'draft')).toBe(false)
    })

    it('archived is terminal', () => {
        expect(STATUS_TRANSITIONS.archived).toEqual([])
        expect(canTransition('archived', 'active')).toBe(false)
        expect(canTransition('archived', 'paused')).toBe(false)
    })
})

describe('checkReadiness', () => {
    const base = {
        name: 'test',
        level: 'line' as const,
        benefitType: 'percent' as const,
        benefitValue: 10,
    }
    const target = { targetType: 'product', exclude: false }

    it('all ok → empty problems', () => {
        expect(checkReadiness(base, [target])).toEqual([])
    })

    it('empty name → NAME_REQUIRED', () => {
        const p = checkReadiness({ ...base, name: '  ' }, [target])
        expect(p.some((x) => x.code === 'NAME_REQUIRED')).toBe(true)
    })

    it('percent out of 1..99 → BENEFIT_INVALID', () => {
        expect(checkReadiness({ ...base, benefitValue: 0 }, [target]).some((x) => x.code === 'BENEFIT_INVALID')).toBe(true)
        expect(checkReadiness({ ...base, benefitValue: 100 }, [target]).some((x) => x.code === 'BENEFIT_INVALID')).toBe(true)
    })

    it('line without include target → TARGETS_REQUIRED', () => {
        const p = checkReadiness(base, [{ targetType: 'product', exclude: true }])
        expect(p.some((x) => x.code === 'TARGETS_REQUIRED')).toBe(true)
    })

    it('set without order-set → TARGETS_REQUIRED', () => {
        const p = checkReadiness({ ...base, level: 'set' }, [])
        expect(p.some((x) => x.code === 'TARGETS_REQUIRED')).toBe(true)
    })

    it('order: no targets needed', () => {
        const p = checkReadiness({ ...base, level: 'order' }, [])
        expect(p.some((x) => x.code === 'TARGETS_REQUIRED')).toBe(false)
    })

    it('endsAt in the past → ALREADY_ENDED', () => {
        const p = checkReadiness({ ...base, endsAt: '2020-01-01' }, [target])
        expect(p.some((x) => x.code === 'ALREADY_ENDED')).toBe(true)
    })

    it('startsAt >= endsAt → PERIOD_INVALID', () => {
        const now = new Date('2026-01-01')
        const p = checkReadiness({ ...base, startsAt: '2026-02-01', endsAt: '2026-01-15' }, [target], { now })
        expect(p.some((x) => x.code === 'PERIOD_INVALID')).toBe(true)
    })

    it('bad timeFrom → TIME_INVALID', () => {
        const p = checkReadiness({ ...base, conditions: { timeFrom: '25:xx' } }, [target])
        expect(p.some((x) => x.code === 'TIME_INVALID')).toBe(true)
    })
})

describe('displayState', () => {
    const now = new Date('2026-06-01T12:00:00Z')

    it('draft → draft', () => {
        expect(displayState({ status: 'draft' }, now)).toBe('draft')
    })
    it('paused → paused', () => {
        expect(displayState({ status: 'paused' }, now)).toBe('paused')
    })
    it('archived → archived', () => {
        expect(displayState({ status: 'archived' }, now)).toBe('archived')
    })
    it('active, startsAt in future → scheduled', () => {
        expect(displayState({ status: 'active', startsAt: '2026-07-01' }, now)).toBe('scheduled')
    })
    it('active, endsAt in past → ended', () => {
        expect(displayState({ status: 'active', endsAt: '2026-05-01' }, now)).toBe('ended')
    })
    it('active, period open → active', () => {
        expect(displayState({ status: 'active', startsAt: '2026-05-01', endsAt: '2026-07-01' }, now)).toBe('active')
    })
    it('active, no period → active', () => {
        expect(displayState({ status: 'active' }, now)).toBe('active')
    })
})
