import { ref, watch } from 'vue'
import { useAuth } from '@/stores/auth'

type Prefs = { soundRequests: boolean; soundOrders: boolean; system: boolean }
const DEFAULTS: Prefs = { soundRequests: true, soundOrders: true, system: false }

function key() {
    const id = useAuth().employee?.id
    return `sp.notify.v2.${id ?? 'anon'}`
}
function legacyKey() {
    const id = useAuth().employee?.id
    return `sp.notify.v1.${id ?? 'anon'}`
}

function load(): Prefs {
    try {
        const raw = localStorage.getItem(key())
        if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
        // Миграция со старого ключа (`sound`-одиночка).
        const legacy = localStorage.getItem(legacyKey())
        if (legacy) {
            const parsed = JSON.parse(legacy)
            return {
                ...DEFAULTS,
                soundRequests: parsed?.sound !== false,
                soundOrders: parsed?.sound !== false,
                system: !!parsed?.system,
            }
        }
    } catch { /* noop */ }
    return { ...DEFAULTS }
}

const state = ref<Prefs>(load())

watch(state, (v) => {
    try { localStorage.setItem(key(), JSON.stringify(v)) } catch { /* noop */ }
}, { deep: true })

export function useNotifyPrefs() {
    return state
}

/** Короткий мягкий сигнал — для новой заявки. */
let audioCtx: AudioContext | null = null
function ctx(): AudioContext | null {
    try {
        audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)()
        return audioCtx
    } catch { return null }
}

export function playChime() {
    if (!state.value.soundRequests) return
    const c = ctx(); if (!c) return
    try {
        const now = c.currentTime
        const osc = c.createOscillator()
        const gain = c.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, now)
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12)
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.28, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
        osc.connect(gain).connect(c.destination)
        osc.start(now); osc.stop(now + 0.4)
    } catch { /* noop */ }
}

/** Два коротких тона — заказы заметнее. */
export function playOrderChime() {
    if (!state.value.soundOrders) return
    const c = ctx(); if (!c) return
    try {
        const burst = (startAt: number) => {
            const osc = c.createOscillator()
            const gain = c.createGain()
            osc.type = 'sine'
            osc.frequency.setValueAtTime(1040, startAt)
            osc.frequency.exponentialRampToValueAtTime(1480, startAt + 0.09)
            gain.gain.setValueAtTime(0, startAt)
            gain.gain.linearRampToValueAtTime(0.32, startAt + 0.015)
            gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.18)
            osc.connect(gain).connect(c.destination)
            osc.start(startAt); osc.stop(startAt + 0.22)
        }
        const t0 = c.currentTime
        burst(t0)
        burst(t0 + 0.17)
    } catch { /* noop */ }
}

export async function requestSystemPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied'
    if (Notification.permission !== 'default') return Notification.permission
    try { return await Notification.requestPermission() }
    catch { return 'denied' }
}

export function showSystemNotification(title: string, body: string, onClick: () => void) {
    if (!state.value.system) return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    if (!document.hidden) return
    try {
        const n = new Notification(title, { body, tag: title + body })
        n.onclick = () => {
            try { window.focus() } catch { /* noop */ }
            onClick()
            n.close()
        }
    } catch { /* noop */ }
}
