import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuth } from '@/stores/auth'
import {
    hubStart, hubStop, hubStatus, hubIsLeader,
    hubOnEvent, hubOnResync, hubOnFallback, hubOnUnauthorized,
} from '@/services/realtimeHub'
import type { RealtimeEvent, OrderSummary } from '@/services/realtime'

type Listener<T> = (e: T) => void
type Created = Extract<RealtimeEvent, { type: 'order.created' }>
type Updated = Extract<RealtimeEvent, { type: 'order.updated' }>

const UNSEEN_KEY = 'sp.realtime.orders.unseen.v1'
const FALLBACK_INTERVAL_MS = 60_000

export const useOrdersFeed = defineStore('ordersFeed', () => {
    const auth = useAuth()
    const status = hubStatus
    const isLeader = hubIsLeader
    const lastSyncAt = ref<string | null>(null)
    const unseenIds = ref<number[]>(loadUnseen())
    const unseenCount = computed(() => unseenIds.value.length)

    const created = new Set<Listener<Created>>()
    const updated = new Set<Listener<Updated>>()
    const resync  = new Set<Listener<void>>()

    let fallbackTimer: number | null = null
    const offs: Array<() => void> = []

    watch(unseenIds, saveUnseen, { deep: true })

    function loadUnseen(): number[] {
        try {
            const raw = sessionStorage.getItem(UNSEEN_KEY)
            if (!raw) return []
            const arr = JSON.parse(raw)
            return Array.isArray(arr) ? arr.filter((x) => Number.isFinite(x)) : []
        } catch { return [] }
    }
    function saveUnseen(ids: number[]) {
        try { sessionStorage.setItem(UNSEEN_KEY, JSON.stringify(ids)) } catch { /* noop */ }
    }

    function markSeen(id: number) {
        if (!unseenIds.value.includes(id)) return
        unseenIds.value = unseenIds.value.filter((x) => x !== id)
    }

    function clearFallback() {
        if (fallbackTimer != null) { clearInterval(fallbackTimer); fallbackTimer = null }
    }
    function enterFallback() {
        if (fallbackTimer != null) return
        fallbackTimer = window.setInterval(() => {
            if (document.visibilityState === 'visible') fireResync()
        }, FALLBACK_INTERVAL_MS)
    }
    function fireResync() {
        lastSyncAt.value = new Date().toISOString()
        for (const fn of resync) try { fn() } catch { /* noop */ }
    }

    function start() {
        if (offs.length) return
        // Все роли, которым разрешён scope 'orders'.
        const role = auth.employee?.role
        if (!role) return
        hubStart()
        offs.push(hubOnEvent((e) => dispatch(e)))
        offs.push(hubOnResync(() => { clearFallback(); fireResync() }))
        offs.push(hubOnFallback(enterFallback))
        offs.push(hubOnUnauthorized(() => stopFeed()))
    }

    function stopFeed() {
        for (const off of offs) try { off() } catch { /* noop */ }
        offs.splice(0)
        clearFallback()
        hubStop()
    }

    function dispatch(ev: RealtimeEvent) {
        if (ev.scope !== 'orders') return
        const me = auth.employee?.id ?? null
        const isMine = ev.actorId != null && ev.actorId === me
        const trackUnseen = auth.employee?.role === 'manager' || auth.employee?.role === 'duty'

        if (ev.type === 'order.created') {
            if (!isMine && trackUnseen && !unseenIds.value.includes(ev.orderId)) {
                unseenIds.value = [ev.orderId, ...unseenIds.value].slice(0, 500)
            }
            for (const fn of created) try { fn(ev) } catch { /* noop */ }
            return
        }
        if (ev.type === 'order.updated') {
            // Заказ взят в работу / смена статуса из new → снимаем «непросмотренную» метку.
            if (ev.kind === 'taken' || (ev.kind === 'status_changed' && ev.status !== 'new')) {
                markSeen(ev.orderId)
            }
            for (const fn of updated) try { fn(ev) } catch { /* noop */ }
        }
    }

    function onCreated(fn: Listener<Created>) { created.add(fn); return () => created.delete(fn) }
    function onUpdated(fn: Listener<Updated>) { updated.add(fn); return () => updated.delete(fn) }
    function onResync(fn: Listener<void>) { resync.add(fn); return () => resync.delete(fn) }

    return {
        status, lastSyncAt, isLeader, unseenIds, unseenCount,
        start, stop: stopFeed, markSeen,
        onCreated, onUpdated, onResync,
    }
})

export type { OrderSummary }
