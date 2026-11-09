import { startSse, type RealtimeEvent, type RealtimeHandlers, type RealtimeStatus } from './realtime'

/** Одно SSE-соединение на браузер (Web Locks + BroadcastChannel).
 *  Если Web Locks недоступны — каждая вкладка держит своё соединение. */

const CHANNEL = 'souppack-realtime'
const LOCK_NAME = 'souppack-realtime'

type Msg =
    | { kind: 'event'; data: RealtimeEvent }
    | { kind: 'status'; data: RealtimeStatus }
    | { kind: 'hello'; data: { seq: number; serverTime: string; isRestart: boolean } }
    | { kind: 'fallback' }
    | { kind: 'logout' }

export type LeaderHandlers = Omit<RealtimeHandlers, 'onUnauthorized' | 'onForbidden'> & {
    onUnauthorized?: RealtimeHandlers['onUnauthorized']
    onForbidden?: RealtimeHandlers['onForbidden']
    /** true, если именно эта вкладка держит SSE-соединение. Нужно для звуков/системных уведомлений. */
    onLeadership(isLeader: boolean): void
}

export function startRealtime(handlers: LeaderHandlers): () => void {
    const channel = 'BroadcastChannel' in self ? new BroadcastChannel(CHANNEL) : null
    let stopSse: (() => void) | null = null
    let released: (() => void) | null = null
    let stopped = false

    const emit = (msg: Msg) => { try { channel?.postMessage(msg) } catch { /* noop */ } }

    const sseHandlers: RealtimeHandlers = {
        onStatus(s) { handlers.onStatus(s); emit({ kind: 'status', data: s }) },
        onHello(info) { handlers.onHello(info); emit({ kind: 'hello', data: info }) },
        onEvent(e) { handlers.onEvent(e); emit({ kind: 'event', data: e }) },
        onFallback() { handlers.onFallback(); emit({ kind: 'fallback' }) },
        onUnauthorized() {
            handlers.onUnauthorized?.()
            emit({ kind: 'logout' })
        },
        onForbidden() { handlers.onForbidden?.() },
    }

    channel?.addEventListener('message', (ev) => {
        const msg = ev.data as Msg
        if (!msg) return
        switch (msg.kind) {
            case 'event': handlers.onEvent(msg.data); break
            case 'status': handlers.onStatus(msg.data); break
            case 'hello': handlers.onHello(msg.data); break
            case 'fallback': handlers.onFallback(); break
            case 'logout': stop(); handlers.onUnauthorized?.(); break
        }
    })

    const run = async () => {
        if (!('locks' in navigator)) {
            // Фолбэк: каждая вкладка держит своё соединение.
            handlers.onLeadership(true)
            stopSse = startSse(sseHandlers)
            return
        }
        try {
            await navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, () =>
                new Promise<void>((resolve) => {
                    if (stopped) { resolve(); return }
                    handlers.onLeadership(true)
                    stopSse = startSse(sseHandlers)
                    released = () => resolve()
                }),
            )
        } catch {
            /* locks aborted — stop() вызвали */
        }
        handlers.onLeadership(false)
    }

    const stop = () => {
        if (stopped) return
        stopped = true
        try { stopSse?.() } catch { /* noop */ }
        stopSse = null
        try { released?.() } catch { /* noop */ }
        released = null
        try { channel?.close() } catch { /* noop */ }
    }

    run()
    return stop
}

export function broadcastLogout() {
    try { new BroadcastChannel(CHANNEL).postMessage({ kind: 'logout' } satisfies Msg) } catch { /* noop */ }
}
