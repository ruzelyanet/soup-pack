import { fetchEventSource } from '@microsoft/fetch-event-source'
import { SERVER_URL } from '@/services/api'
import { useAuth } from '@/stores/auth'

export type RealtimeStatus = 'connecting' | 'open' | 'fallback' | 'off'

export type Scope = 'requests' | 'orders'

export type RealtimeEvent =
    | { scope: 'requests'; type: 'request.created';   requestId: number; summary: RequestSummary; actorId: number | null; seq: number; at: string }
    | { scope: 'requests'; type: 'request.updated';   requestId: number; kind: string;             actorId: number | null; seq: number; at: string }
    | { scope: 'requests'; type: 'request.reordered'; columnId: number;                            actorId: number | null; seq: number; at: string }
    | { scope: 'requests'; type: 'request.overdue';   requestId: number; summary: RequestSummary;                           seq: number; at: string }
    | { scope: 'orders';   type: 'order.created';     orderId: number;   summary: OrderSummary;    actorId: number | null; seq: number; at: string }
    | { scope: 'orders';   type: 'order.updated';     orderId: number;   kind: OrderEventKind; status: string; actorId: number | null; seq: number; at: string }

export type RequestSummary = {
    id: number
    code: string
    type: 'individual' | 'shop'
    name: string
    source: 'manual' | 'form' | 'api'
    sourceDetail: string | null
    createdAt: string
}

export type OrderSummary = {
    id: number
    documentId: string
    code: string
    status: 'new' | 'accepted' | 'in_progress' | 'done' | 'canceled'
    clientName: string | null
    itemsCount: number
    total: number
    deliveryMethod: 'courier_now' | 'preorder'
    deliverySlotAt: string | null
    paymentMethod: string
    source: 'catalog' | 'request' | 'manual' | 'telegram'
    createdAt: string
}

export type OrderEventKind = 'status_changed' | 'taken' | 'payment' | 'refund' | 'tx-cancelled' | 'updated'

export type RealtimeHandlers = {
    onStatus(s: RealtimeStatus): void
    onHello(info: { seq: number; serverTime: string; isRestart: boolean }): void
    onEvent(e: RealtimeEvent): void
    /** 3 неудачных подключения подряд → переходим в fallback (polling). */
    onFallback(): void
    /** 401 → logout и редирект на логин. */
    onUnauthorized(): void
    /** 403 — не наша роль; молча off. */
    onForbidden(): void
}

const BACKOFF_SEC = [1, 2, 4, 8, 16, 30]
const jitter = (ms: number) => Math.round(ms * (1 + (Math.random() - 0.5) * 0.4))

export function startSse(handlers: RealtimeHandlers): () => void {
    const auth = useAuth()
    const ctrl = new AbortController()
    let attempt = 0
    let failuresInARow = 0
    let lastSeq = 0
    let stopped = false

    const connect = async () => {
        if (stopped) return
        handlers.onStatus('connecting')
        try {
            await fetchEventSource(SERVER_URL + '/staff/events', {
                signal: ctrl.signal,
                openWhenHidden: true,
                headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
                async onopen(res) {
                    if (res.ok && res.headers.get('content-type')?.includes('text/event-stream')) {
                        failuresInARow = 0
                        attempt = 0
                        handlers.onStatus('open')
                        return
                    }
                    if (res.status === 401) {
                        stopped = true
                        handlers.onUnauthorized()
                        throw new Error('unauthorized')
                    }
                    if (res.status === 403) {
                        stopped = true
                        handlers.onForbidden()
                        handlers.onStatus('off')
                        throw new Error('forbidden')
                    }
                    throw new Error('bad response ' + res.status)
                },
                onmessage(ev) {
                    if (ev.event === 'hello') {
                        const payload = JSON.parse(ev.data) as { seq: number; serverTime: string }
                        const isRestart = payload.seq < lastSeq
                        lastSeq = payload.seq
                        handlers.onHello({ ...payload, isRestart })
                        return
                    }
                    if (!ev.event) return
                    try {
                        const data = JSON.parse(ev.data) as RealtimeEvent
                        if (data.seq && data.seq <= lastSeq) return
                        if (data.seq) lastSeq = data.seq
                        handlers.onEvent(data)
                    } catch (e: any) {
                        console.warn('[realtime] bad event', e?.message)
                    }
                },
                onerror(err) {
                    // Пробрасываем — fetch-event-source сам закроет; свой retry сверху.
                    throw err
                },
                onclose() {
                    throw new Error('closed')
                },
            })
        } catch (e: any) {
            if (stopped) return
            failuresInARow += 1
            if (failuresInARow >= 3) handlers.onFallback()
            const base = BACKOFF_SEC[Math.min(attempt, BACKOFF_SEC.length - 1)] * 1000
            attempt += 1
            await new Promise((r) => setTimeout(r, jitter(base)))
            if (!stopped) connect()
        }
    }

    connect()
    return () => {
        stopped = true
        try { ctrl.abort() } catch { /* noop */ }
        handlers.onStatus('off')
    }
}
