import type { Core } from '@strapi/strapi'
import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import { getRealtimeBus, type RequestSummary } from '../../../utils/realtime'

const { ApplicationError } = errors

type Role = 'manager' | 'duty' | 'courier'

type CreateInput = {
    type: 'individual' | 'shop'
    name: string
    phone: string
    values?: Array<{ key: string; label: string; value: unknown }>
    extra?: Record<string, unknown>
    comment?: string
    source: 'manual' | 'form' | 'api'
    sourceDetail?: string
    createdById?: number
    columnId?: number
    idempotencyKey?: string | null
}

function normalizePhone(input: string): string {
    const digits = (input || '').replace(/\D/g, '').slice(-9)
    return '+998' + digits
}

/** Простой генератор `RQ-NNNNNN` на основе последнего id. На гонки защищены unique-constraint'ом. */
async function nextCode(strapi: Core.Strapi): Promise<string> {
    const last = await strapi.db.query('api::request.request').findMany({
        orderBy: { id: 'desc' as const },
        limit: 1,
        select: ['id'],
    })
    const nextId = (last[0]?.id ?? 0) + 1
    return 'RQ-' + String(nextId).padStart(6, '0')
}

export default factories.createCoreService('api::request.request' as any, ({ strapi }: any) => ({
    normalizePhone,

    /** Писать историю заявки. */
    async logEvent(requestId: number, kind: string, payload?: any, actorId?: number | null, note?: string) {
        await strapi.db.query('api::request-event.request-event').create({
            data: {
                kind,
                payload: payload ?? null,
                note: note ?? null,
                request: requestId,
                actor: actorId ?? null,
                publishedAt: new Date(),
            },
        })
        try {
            const bus = getRealtimeBus()
            if (kind === 'created') {
                const row = await strapi.db.query('api::request.request').findOne({
                    where: { id: requestId },
                    select: ['id', 'code', 'type', 'name', 'source', 'sourceDetail', 'createdAt'],
                })
                if (row) {
                    const summary: RequestSummary = {
                        id: row.id, code: row.code, type: row.type, name: row.name,
                        source: row.source, sourceDetail: row.sourceDetail ?? null,
                        createdAt: new Date(row.createdAt).toISOString(),
                    }
                    bus.publish({ scope: 'requests', type: 'request.created', requestId, summary, actorId: actorId ?? null })
                }
            } else {
                bus.publish({ scope: 'requests', type: 'request.updated', requestId, kind, actorId: actorId ?? null })
            }
        } catch (e: any) {
            strapi.log.warn('[realtime.publish] ' + (e?.message || e))
        }
    },

    /** Досоздать `goal-state`-записи по текущим целям колонки. Идемпотентно. */
    async ensureGoalStates(requestId: number, columnId: number) {
        const goals = await strapi.db.query('api::request-goal.request-goal').findMany({
            where: { column: columnId },
            select: ['id', 'text'],
            orderBy: { position: 'asc' as const },
        })
        for (const g of goals) {
            const existing = await strapi.db
                .query('api::request-goal-state.request-goal-state')
                .findOne({ where: { request: requestId, goal: g.id } })
            if (!existing) {
                await strapi.db.query('api::request-goal-state.request-goal-state').create({
                    data: {
                        request: requestId,
                        goal: g.id,
                        column: columnId,
                        goalText: g.text,
                        done: false,
                        removed: false,
                        publishedAt: new Date(),
                    },
                })
            }
        }
    },

    /** Создать заявку: нормализация телефона, привязка к существующему клиенту, позиция в колонке new,
     *  запись начального события и goal-states по колонке new. */
    async createRequest(input: CreateInput, options: { actorId?: number | null } = {}): Promise<any> {
        if (!input?.name?.trim()) throw new ApplicationError('name is required')
        const rawPhone = String(input?.phone || '').trim()
        if (!rawPhone) throw new ApplicationError('phone is required')
        const phone = normalizePhone(rawPhone)
        if (phone.length !== 13) throw new ApplicationError('invalid phone')

        // Идемпотентность: повтор с тем же ключом → вернуть ту же заявку.
        if (input.idempotencyKey) {
            const existing = await strapi.db.query('api::request.request').findOne({
                where: { idempotencyKey: input.idempotencyKey },
                populate: ['column'],
            })
            if (existing) return existing
        }

        // Колонка: явно переданная или зашитая `new`.
        let columnId: number
        if (input.columnId) {
            columnId = input.columnId
        } else {
            const newCol = await strapi.db
                .query('api::request-column.request-column')
                .findOne({ where: { kind: 'new' } })
            if (!newCol) throw new ApplicationError('new column is missing — bootstrap failed')
            columnId = newCol.id
        }

        // Привязываем к существующему клиенту (не создаём).
        const client = await strapi.db
            .query('api::client.client')
            .findOne({ where: { phone }, select: ['id'] })

        // Дубликаты: открытая, не архивная заявка на тот же телефон.
        const duplicate = await strapi.db.query('api::request.request').findOne({
            where: { phone, outcome: 'open', archived: false },
            select: ['id', 'code'],
        })
        const extra = { ...(input.extra || {}) }
        if (duplicate) {
            ;(extra as any).duplicateOf = duplicate.code
        }

        // Позиция в колонке = max + 1.
        const last = await strapi.db.query('api::request.request').findMany({
            where: { column: columnId },
            orderBy: { position: 'desc' as const },
            limit: 1,
            select: ['position'],
        })
        const position = (last[0]?.position ?? 0) + 1

        const code = await nextCode(strapi)

        const created = await strapi.db.query('api::request.request').create({
            data: {
                code,
                type: input.type,
                name: input.name.trim(),
                phone,
                values: input.values ?? [],
                extra,
                comment: input.comment || null,
                source: input.source,
                sourceDetail: input.sourceDetail || null,
                column: columnId,
                position,
                outcome: 'open',
                columnEnteredAt: new Date(),
                client: client?.id ?? null,
                createdByEmployee: input.createdById ?? null,
                idempotencyKey: input.idempotencyKey || null,
                publishedAt: new Date(),
            },
        })

        await this.ensureGoalStates(created.id, columnId)
        await this.logEvent(created.id, 'created', { source: input.source, type: input.type }, options.actorId ?? input.createdById ?? null)

        return created
    },

    /** Переместить заявку в другую колонку (или сменить position). */
    async moveRequest(
        requestId: number,
        targetColumnId: number,
        position: number | null,
        actorId: number | null,
    ) {
        const request = await strapi.db.query('api::request.request').findOne({
            where: { id: requestId },
            populate: ['column'],
        })
        if (!request) throw new ApplicationError('request not found')
        if (request.lockedAt) throw new ApplicationError('REQUEST_LOCKED')

        const targetColumn = await strapi.db
            .query('api::request-column.request-column')
            .findOne({ where: { id: targetColumnId } })
        if (!targetColumn) throw new ApplicationError('column not found')

        const fromColumnId = request.column?.id

        if (fromColumnId !== targetColumnId) {
            // Нельзя выйти из `new`, если нет ответственного.
            if (request.column?.kind === 'new' && !request.acceptedById) {
                throw new ApplicationError('REQUEST_NOT_ACCEPTED')
            }
        }

        // Позиция по умолчанию — в конец целевой колонки.
        let finalPosition = position
        if (finalPosition == null) {
            const last = await strapi.db.query('api::request.request').findMany({
                where: { column: targetColumnId },
                orderBy: { position: 'desc' as const },
                limit: 1,
                select: ['position'],
            })
            finalPosition = (last[0]?.position ?? 0) + 1
        }

        const patch: Record<string, any> = {
            column: targetColumnId,
            position: finalPosition,
        }
        if (fromColumnId !== targetColumnId) {
            patch.columnEnteredAt = new Date()
        }

        await strapi.db.query('api::request.request').update({
            where: { id: requestId },
            data: patch,
        })

        if (fromColumnId !== targetColumnId) {
            await this.ensureGoalStates(requestId, targetColumnId)
            await this.logEvent(
                requestId,
                'moved',
                { from: fromColumnId, to: targetColumnId },
                actorId,
            )
        }

        return strapi.db.query('api::request.request').findOne({
            where: { id: requestId },
            populate: ['column', 'assignee', 'client'],
        })
    },

    /** Атомарное принятие заявки. Если уже кем-то захвачено — кидаем ALREADY_TAKEN. */
    async acceptRequest(requestId: number, employeeId: number) {
        const tableName = (strapi.getModel('api::request.request' as any) as any).collectionName as string

        const result: { request: any; movedToColumnId: number | null } = await strapi.db.transaction(
            async ({ trx }: any) => {
                const now = new Date()
                const affected: any = await strapi.db
                    .connection(tableName)
                    .transacting(trx)
                    .where({ id: requestId })
                    .whereNull('accepted_by_id')
                    .update({ accepted_by_id: employeeId, accepted_at: now })

                const changed = typeof affected === 'number' ? affected : Number(affected ?? 0)
                if (!changed) throw new ApplicationError('ALREADY_TAKEN')

                // Назначаем assignee на уровне ORM, чтобы связи работали.
                await strapi.db.query('api::request.request').update({
                    where: { id: requestId },
                    data: { assignee: employeeId },
                })

                // Если заявка в колонке `new` и есть кастомные колонки — переносим в первую custom.
                const req = await strapi.db.query('api::request.request').findOne({
                    where: { id: requestId },
                    populate: ['column'],
                })
                let movedToColumnId: number | null = null
                if (req?.column?.kind === 'new') {
                    const firstCustom = await strapi.db
                        .query('api::request-column.request-column')
                        .findMany({
                            where: { kind: 'custom' },
                            orderBy: { position: 'asc' as const },
                            limit: 1,
                        })
                    if (firstCustom[0]) {
                        const last = await strapi.db.query('api::request.request').findMany({
                            where: { column: firstCustom[0].id },
                            orderBy: { position: 'desc' as const },
                            limit: 1,
                            select: ['position'],
                        })
                        const position = (last[0]?.position ?? 0) + 1
                        await strapi.db.query('api::request.request').update({
                            where: { id: requestId },
                            data: {
                                column: firstCustom[0].id,
                                position,
                                columnEnteredAt: new Date(),
                            },
                        })
                        movedToColumnId = firstCustom[0].id
                    }
                }

                return { request: req, movedToColumnId }
            },
        )

        if (result.movedToColumnId) {
            await this.ensureGoalStates(requestId, result.movedToColumnId)
        }
        await this.logEvent(requestId, 'accepted', { employeeId, movedToColumnId: result.movedToColumnId }, employeeId)

        return strapi.db.query('api::request.request').findOne({
            where: { id: requestId },
            populate: ['column', 'assignee', 'client'],
        })
    },

    /** Доступ: может ли сотрудник двигать/редактировать заявку. */
    canMutate(request: any, employee: { id: number; role: Role }): boolean {
        if (!employee) return false
        if (employee.role === 'manager') return true
        if (employee.role === 'duty') return request?.assignee?.id === employee.id
        return false
    },
}))
