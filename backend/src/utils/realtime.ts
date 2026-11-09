import { EventEmitter } from 'node:events'

/** Короткая строка для уведомления; **без телефона**. */
export type RequestSummary = {
    id: number
    code: string
    type: 'individual' | 'shop'
    name: string
    source: 'manual' | 'form' | 'api'
    sourceDetail: string | null
    createdAt: string
}

/** Короткая строка заказа; **без телефона, адреса и состава**. */
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

export type OrderEventKind =
    | 'status_changed' | 'taken' | 'payment' | 'refund' | 'tx-cancelled' | 'updated'

export type Scope = 'requests' | 'orders'

export type RealtimeEvent =
    | { scope: 'requests'; type: 'request.created';   requestId: number; summary: RequestSummary; actorId: number | null }
    | { scope: 'requests'; type: 'request.updated';   requestId: number; kind: string;             actorId: number | null }
    | { scope: 'requests'; type: 'request.reordered'; columnId: number;                            actorId: number | null }
    | { scope: 'requests'; type: 'request.overdue';   requestId: number; summary: RequestSummary }
    | { scope: 'orders';   type: 'order.created';     orderId: number;  summary: OrderSummary;    actorId: number | null }
    | { scope: 'orders';   type: 'order.updated';     orderId: number;  kind: OrderEventKind; status: string; actorId: number | null }

export type EnvelopedEvent = RealtimeEvent & { seq: number; at: string }

export interface RealtimeBus {
    publish(e: RealtimeEvent): EnvelopedEvent
    subscribe(fn: (e: EnvelopedEvent) => void): () => void
    readonly lastSeq: number
}

/** Какие scope разрешены какой роли (подписка на SSE фильтрует по этой таблице). */
export const ROLE_SCOPES: Record<string, Scope[]> = {
    manager: ['requests', 'orders'],
    duty:    ['requests', 'orders'],
    courier: ['orders'],
}

export function canReceive(role: string | undefined | null, scope: Scope): boolean {
    if (!role) return false
    return (ROLE_SCOPES[role] || []).includes(scope)
}

class InMemoryBus implements RealtimeBus {
    private emitter = new EventEmitter()
    private seq = 0

    constructor() { this.emitter.setMaxListeners(0) }

    get lastSeq() { return this.seq }

    publish(e: RealtimeEvent): EnvelopedEvent {
        this.seq += 1
        const env: EnvelopedEvent = { ...e, seq: this.seq, at: new Date().toISOString() }
        this.emitter.emit('e', env)
        return env
    }

    subscribe(fn: (e: EnvelopedEvent) => void): () => void {
        this.emitter.on('e', fn)
        return () => this.emitter.off('e', fn)
    }
}

/** Форматирование одного SSE-сообщения (чистая функция — удобно для тестов). */
export function formatSseMessage(env: EnvelopedEvent): string {
    const data = JSON.stringify(env)
    return `id: ${env.seq}\nevent: ${env.type}\ndata: ${data}\n\n`
}

let bus: RealtimeBus | null = null
export function getRealtimeBus(): RealtimeBus {
    if (!bus) bus = new InMemoryBus()
    return bus
}
