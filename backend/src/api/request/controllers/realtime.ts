import { PassThrough } from 'node:stream'
import { getRealtimeBus, formatSseMessage, canReceive, type EnvelopedEvent } from '../../../utils/realtime'

const MAX_STREAMS_PER_EMPLOYEE = 5
const PING_EVERY_MS = 25_000

type StreamHandle = {
    stream: PassThrough
    close: () => void
}
const streamsByEmployee: Map<number, Set<StreamHandle>> = new Map()
let shutdownBound = false

function bindShutdownOnce(strapi: any) {
    if (shutdownBound) return
    shutdownBound = true
    strapi.server.httpServer?.on('close', () => {
        for (const set of streamsByEmployee.values()) {
            for (const h of Array.from(set)) {
                try { h.close() } catch { /* noop */ }
            }
        }
        streamsByEmployee.clear()
    })
}

export default {
    /** GET /staff/events — SSE-поток событий заявок. */
    async stream(ctx: any) {
        const strapi = (ctx as any).strapi || (global as any).strapi
        const employee = ctx.state.employee
        bindShutdownOnce(strapi)

        const bus = getRealtimeBus()
        const stream = new PassThrough()

        ctx.set('Content-Type', 'text/event-stream; charset=utf-8')
        ctx.set('Cache-Control', 'no-cache, no-transform')
        ctx.set('Connection', 'keep-alive')
        ctx.set('X-Accel-Buffering', 'no')
        ctx.status = 200
        ctx.body = stream

        try {
            ctx.req.socket.setTimeout(0)
            ctx.req.socket.setNoDelay(true)
            ctx.req.socket.setKeepAlive(true)
        } catch { /* noop */ }

        stream.write(`retry: 5000\n\n`)
        stream.write(
            `event: hello\n` +
            `data: ${JSON.stringify({ seq: bus.lastSeq, serverTime: new Date().toISOString() })}\n\n`,
        )

        const ping = setInterval(() => {
            try { stream.write(`: ping\n\n`) } catch { /* noop */ }
        }, PING_EVERY_MS)

        const unsubscribe = bus.subscribe((e: EnvelopedEvent) => {
            if (!canReceive(employee.role, e.scope)) return
            try { stream.write(formatSseMessage(e)) } catch { /* noop */ }
        })

        let closed = false
        const close = () => {
            if (closed) return
            closed = true
            clearInterval(ping)
            unsubscribe()
            try { stream.end() } catch { /* noop */ }
            const set = streamsByEmployee.get(employee.id)
            if (set) {
                set.delete(handle)
                if (!set.size) streamsByEmployee.delete(employee.id)
            }
            strapi.log?.debug?.(`[realtime] disconnect employee=${employee.id}`)
        }
        const handle: StreamHandle = { stream, close }

        let set = streamsByEmployee.get(employee.id)
        if (!set) { set = new Set(); streamsByEmployee.set(employee.id, set) }
        if (set.size >= MAX_STREAMS_PER_EMPLOYEE) {
            // Закрыть самое старое — Set сохраняет порядок вставки.
            const oldest = set.values().next().value as StreamHandle | undefined
            if (oldest) {
                strapi.log?.info?.(`[realtime] limit reached, dropping oldest for employee=${employee.id}`)
                oldest.close()
            }
        }
        set.add(handle)
        strapi.log?.debug?.(`[realtime] connect employee=${employee.id} (${set.size} streams)`)

        ctx.req.on('close', close)
        ctx.req.on('error', close)
    },
}
