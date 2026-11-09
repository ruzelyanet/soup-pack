import { ref } from 'vue'
import { startRealtime, type LeaderHandlers } from './realtimeLeader'
import type { RealtimeEvent, RealtimeStatus } from './realtime'

/** Общий слой поверх `realtimeLeader`: одно соединение на браузер и несколько подписчиков. */

type EventFn = (e: RealtimeEvent) => void
type VoidFn = () => void

const eventSubs = new Set<EventFn>()
const resyncSubs = new Set<VoidFn>()
const fallbackSubs = new Set<VoidFn>()
const leadershipSubs = new Set<(flag: boolean) => void>()
const unauthorizedSubs = new Set<VoidFn>()

export const hubStatus = ref<RealtimeStatus>('off')
export const hubIsLeader = ref(false)

let stopFn: (() => void) | null = null
let startCount = 0

const handlers: LeaderHandlers = {
    onStatus(s) { hubStatus.value = s },
    onHello() { /* подписчики видят resync через onResync */ for (const fn of resyncSubs) try { fn() } catch { /* noop */ } },
    onEvent(e) { for (const fn of eventSubs) try { fn(e) } catch { /* noop */ } },
    onFallback() { for (const fn of fallbackSubs) try { fn() } catch { /* noop */ } },
    onUnauthorized() { for (const fn of unauthorizedSubs) try { fn() } catch { /* noop */ } },
    onLeadership(flag) { hubIsLeader.value = flag; for (const fn of leadershipSubs) try { fn(flag) } catch { /* noop */ } },
}

export function hubStart() {
    startCount += 1
    if (stopFn) return
    stopFn = startRealtime(handlers)
}

export function hubStop() {
    startCount = Math.max(0, startCount - 1)
    if (startCount > 0) return
    try { stopFn?.() } catch { /* noop */ }
    stopFn = null
    hubStatus.value = 'off'
    hubIsLeader.value = false
}

export function hubOnEvent(fn: EventFn): () => void { eventSubs.add(fn); return () => eventSubs.delete(fn) }
export function hubOnResync(fn: VoidFn): () => void { resyncSubs.add(fn); return () => resyncSubs.delete(fn) }
export function hubOnFallback(fn: VoidFn): () => void { fallbackSubs.add(fn); return () => fallbackSubs.delete(fn) }
export function hubOnLeadership(fn: (flag: boolean) => void): () => void { leadershipSubs.add(fn); return () => leadershipSubs.delete(fn) }
export function hubOnUnauthorized(fn: VoidFn): () => void { unauthorizedSubs.add(fn); return () => unauthorizedSubs.delete(fn) }
