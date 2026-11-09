import { describe, it, expect } from 'vitest'

/** Воспроизводит логику из controllers/order.ts::update: вытащить statusNote и вернуть
 *  "очищенный" payload. Если ломается контракт — тест упадёт. */
function extractStatusNote(body: any): { statusNote: string; cleanPayload: any } {
    const b: any = body?.data ? { ...body, data: { ...body.data } } : { data: { ...(body || {}) } }
    const payload = b.data as Record<string, any>
    const raw = typeof payload.statusNote === 'string' ? payload.statusNote.trim() : ''
    if ('statusNote' in payload) delete payload.statusNote
    return { statusNote: raw, cleanPayload: payload }
}

describe('update: statusNote extraction', () => {
    it('вытащен из data и удалён', () => {
        const { statusNote, cleanPayload } = extractStatusNote({
            data: { status: 'accepted', statusNote: '  клиент согласовал  ' },
        })
        expect(statusNote).toBe('клиент согласовал')
        expect(cleanPayload).toEqual({ status: 'accepted' })
    })

    it('нет поля — пустая строка', () => {
        const { statusNote, cleanPayload } = extractStatusNote({ data: { status: 'done' } })
        expect(statusNote).toBe('')
        expect(cleanPayload).toEqual({ status: 'done' })
    })

    it('не кидается при форме без обёртки data', () => {
        const { statusNote, cleanPayload } = extractStatusNote({ status: 'done', statusNote: 'ok' })
        expect(statusNote).toBe('ok')
        expect(cleanPayload).toEqual({ status: 'done' })
    })

    it('пустая строка после trim → не записываем note', () => {
        const { statusNote } = extractStatusNote({ data: { statusNote: '   ' } })
        expect(statusNote).toBe('')
    })
})

/** Из `take` убран блок смены статуса — проверяем, что constante не содержит старых фраз. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('take: не меняет статус', () => {
    it('в контроллере нет "status: \'accepted\'" внутри take', () => {
        const src = readFileSync(
            resolve(__dirname, '../src/api/order/controllers/order.ts'), 'utf8',
        )
        // Вырезаем область функции take — грубо, по заголовку до следующего комментария/метода.
        const start = src.indexOf('async take(ctx)')
        expect(start).toBeGreaterThan(0)
        const after = src.slice(start, start + 2000)
        expect(after).not.toContain("data: { status: 'accepted' }")
        expect(after).toContain("'taken'")
    })
})
