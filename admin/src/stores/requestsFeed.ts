import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuth } from '@/stores/auth'
import {
    hubStart, hubStop, hubStatus, hubIsLeader,
    hubOnEvent, hubOnResync, hubOnFallback, hubOnLeadership, hubOnUnauthorized,
} from '@/services/realtimeHub'
import type { RealtimeEvent, RequestSummary } from '@/services/realtime'

type Listener<T> = (e: T) => void
type Created   = Extract<RealtimeEvent, { type: 'request.created' }>
type Updated   = Extract<RealtimeEvent, { type: 'request.updated' }>
type Reordered = Extract<RealtimeEvent, { type: 'request.reordered' }>
type Overdue   = Extract<RealtimeEvent, { type: 'request.overdue' }>

const UNSEEN_KEY = 'sp.realtime.unseen.v1'
const FALLBACK_INTERVAL_MS = 60_000

export const useRequestsFeed = defineStore('requestsFeed', () => {
    const auth = useAuth()
    const status = hubStatus
    const isLeader = hubIsLeader
    const lastSyncAt = ref<string | null>(null)
    const unseenIds = ref<number[]>(loadUnseen())

    const unseenCount = computed(() => unseenIds.value.length)

    const created   = new Set<Listener<Created>>()
    const updated   = new Set<Listener<Updated>>()
    const reordered = new Set<Listener<Reordered>>()
    const overdue   = new Set<Listener<Overdue>>()
    const resync    = new Set<Listener<void>>()

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
        const role = auth.employee?.role
        if (role !== 'manager' && role !== 'duty') return
        hubStart()
        offs.push(hubOnEvent((e) => dispatch(e)))
        offs.push(hubOnResync(() => { clearFallback(); fireResync() }))
        offs.push(hubOnFallback(enterFallback))
        offs.push(hubOnUnauthorized(() => {
            stopFeed()
            auth.logout()
            if (!location.pathname.endsWith('/login')) location.href = '/admin/login'
        }))
    }

    function stopFeed() {
        for (const off of offs) try { off() } catch { /* noop */ }
        offs.splice(0)
        clearFallback()
        hubStop()
    }

    function dispatch(ev: RealtimeEvent) {
        if (ev.scope !== 'requests') return
        // Своё действие не триггерит уведомления/подсветки.
        const me = auth.employee?.id ?? null
        const isMine = 'actorId' in ev && ev.actorId != null && ev.actorId === me

        switch (ev.type) {
            case 'request.created': {
                if (!isMine && !unseenIds.value.includes(ev.requestId)) {
                    unseenIds.value = [ev.requestId, ...unseenIds.value].slice(0, 500)
                }
                for (const fn of created) try { fn(ev) } catch { /* noop */ }
                break
            }
            case 'request.updated': {
                // Если заявку приняли/закрыли/конвертировали — она больше не "unseen".
                if (['accepted', 'lost', 'converted'].includes(ev.kind)) markSeen(ev.requestId)
                for (const fn of updated) try { fn(ev) } catch { /* noop */ }
                break
            }
            case 'request.reordered': {
                for (const fn of reordered) try { fn(ev) } catch { /* noop */ }
                break
            }
            case 'request.overdue': {
                for (const fn of overdue) try { fn(ev) } catch { /* noop */ }
                break
            }
        }
    }

    function onCreated(fn: Listener<Created>) {
        created.add(fn); return () => created.delete(fn)
    }
    function onUpdated(fn: Listener<Updated>) {
        updated.add(fn); return () => updated.delete(fn)
    }
    function onReordered(fn: Listener<Reordered>) {
        reordered.add(fn); return () => reordered.delete(fn)
    }
    function onOverdue(fn: Listener<Overdue>) {
        overdue.add(fn); return () => overdue.delete(fn)
    }
    function onResync(fn: Listener<void>) {
        resync.add(fn); return () => resync.delete(fn)
    }

    return {
        status, lastSyncAt, isLeader, unseenIds, unseenCount,
        start, stop: stopFeed, markSeen,
        onCreated, onUpdated, onReordered, onOverdue, onResync,
    }
})

export type { RealtimeEvent, RequestSummary }
