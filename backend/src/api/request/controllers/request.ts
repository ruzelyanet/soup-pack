import { factories } from '@strapi/strapi'
import { errors } from '@strapi/utils'
import { getRealtimeBus } from '../../../utils/realtime'

const { ApplicationError } = errors

type Scope = 'queue' | 'mine' | 'all'

function cleanRequestRow(r: any) {
    if (!r) return r
    return r
}

export default factories.createCoreController('api::request.request' as any, ({ strapi }: any) => ({
    /** Список заявок с учётом роли и scope. */
    async list(ctx) {
        const employee = ctx.state.employee
        const role = employee.role as 'manager' | 'duty' | 'courier'
        if (role === 'courier') return ctx.forbidden('FORBIDDEN_ROLE')

        const q = ctx.query || {}
        const scope: Scope = (q.scope as Scope) || (role === 'manager' ? 'all' : 'queue')
        const filters: Record<string, any> = { archived: false }
        if (q.type) filters.type = q.type
        if (q.outcome) filters.outcome = q.outcome
        if (q.columnId) filters.column = Number(q.columnId)
        if (q.q) {
            const s = String(q.q).trim()
            if (s) {
                filters.$or = [
                    { code: { $containsi: s } },
                    { name: { $containsi: s } },
                    { phone: { $containsi: s } },
                ]
            }
        }
        if (q.ids) {
            const ids = String(q.ids).split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0).slice(0, 50)
            if (ids.length) filters.id = { $in: ids }
            else { ctx.body = { data: [] }; return }
        }

        if (scope === 'queue') {
            filters.acceptedById = { $null: true }
            filters.outcome = 'open'
        } else if (scope === 'mine') {
            filters.acceptedById = employee.id
        } else if (scope === 'all' && role === 'duty') {
            // Дежурный «все» → свои + свободные.
            filters.$or = [
                { acceptedById: employee.id },
                { acceptedById: { $null: true } },
            ]
        }

        // Опциональная пагинация. По умолчанию — всё (до 500), обратная совместимость с доской.
        const page = Math.max(1, Number((q as any).page) || 1)
        const pageSizeRaw = Number((q as any).pageSize) || 0
        const pageSize = pageSizeRaw > 0 ? Math.min(100, Math.max(1, pageSizeRaw)) : 500

        const [rows, total] = await Promise.all([
            strapi.db.query('api::request.request').findMany({
                where: filters,
                populate: ['column', 'assignee', 'client'],
                orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
                limit: pageSize,
                offset: (page - 1) * pageSize,
            }),
            pageSizeRaw > 0 ? strapi.db.query('api::request.request').count({ where: filters }) : Promise.resolve(0),
        ])

        ctx.body = {
            data: rows.map(cleanRequestRow),
            ...(pageSizeRaw > 0 ? { meta: { pagination: { page, pageSize, pageCount: Math.ceil(total / pageSize), total } } } : {}),
        }
    },

    /** Полная карточка заявки + события + goal-states. */
    async getOne(ctx) {
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')

        const request = await strapi.db.query('api::request.request').findOne({
            where: { id },
            populate: ['column', 'assignee', 'client', 'createdByEmployee', 'order'],
        })
        if (!request) return ctx.notFound()

        const [events, goalStates] = await Promise.all([
            strapi.db.query('api::request-event.request-event').findMany({
                where: { request: id },
                populate: ['actor'],
                orderBy: { id: 'asc' as const },
                limit: 200,
            }),
            strapi.db.query('api::request-goal-state.request-goal-state').findMany({
                where: { request: id },
                populate: ['goal', 'column'],
                orderBy: { id: 'asc' as const },
                limit: 500,
            }),
        ])

        ctx.body = { data: { request, events, goalStates } }
    },

    /** Ручное создание заявки. */
    async create(ctx) {
        const employee = ctx.state.employee
        if (!['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        if (!body) return ctx.badRequest('body is required')
        if (!['individual', 'shop'].includes(body.type)) return ctx.badRequest('invalid type')

        try {
            const created = await strapi.service('api::request.request').createRequest(
                {
                    type: body.type,
                    name: body.name,
                    phone: body.phone,
                    values: body.values,
                    extra: body.extra,
                    comment: body.comment,
                    source: 'manual',
                    sourceDetail: body.sourceDetail,
                    createdById: employee.id,
                },
                { actorId: employee.id },
            )
            ctx.body = { data: created }
        } catch (err: any) {
            if (err instanceof ApplicationError) return ctx.badRequest(err.message)
            strapi.log.error('[requests/create] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'create failed')
        }
    },

    /** Правка полей (пока заявка не locked). */
    async patch(ctx) {
        const employee = ctx.state.employee
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')

        const request = await strapi.db.query('api::request.request').findOne({
            where: { id },
            populate: ['assignee'],
        })
        if (!request) return ctx.notFound()
        if (request.lockedAt) return ctx.badRequest('REQUEST_LOCKED')
        if (!strapi.service('api::request.request').canMutate(request, employee)) {
            return ctx.forbidden('FORBIDDEN_ROLE')
        }

        const body = (ctx.request.body?.data || ctx.request.body) as any
        const patch: Record<string, any> = {}
        for (const k of ['name', 'phone', 'comment', 'sourceDetail'] as const) {
            if (k in body) patch[k] = body[k]
        }
        if ('type' in body) {
            if (!['individual', 'shop'].includes(body.type)) return ctx.badRequest('invalid type')
            patch.type = body.type
        }
        if ('values' in body) patch.values = body.values
        if ('extra' in body) patch.extra = body.extra

        if (patch.phone) {
            patch.phone = strapi.service('api::request.request').normalizePhone(patch.phone)
            if (patch.phone.length !== 13) return ctx.badRequest('invalid phone')
            const client = await strapi.db
                .query('api::client.client')
                .findOne({ where: { phone: patch.phone }, select: ['id'] })
            patch.client = client?.id ?? null
        }

        const updated = await strapi.db.query('api::request.request').update({
            where: { id },
            data: patch,
        })
        await strapi.service('api::request.request').logEvent(id, 'patched', patch, employee.id)

        ctx.body = { data: updated }
    },

    /** Атомарное принятие. */
    async accept(ctx) {
        const employee = ctx.state.employee
        if (!['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')

        try {
            const req = await strapi.service('api::request.request').acceptRequest(id, employee.id)
            ctx.body = { data: req }
        } catch (err: any) {
            if (err?.message === 'ALREADY_TAKEN') {
                return ctx.conflict('ALREADY_TAKEN')
            }
            strapi.log.error('[requests/accept] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'accept failed')
        }
    },

    /** Переназначить ответственного (manager). null — снять назначение. */
    async reassign(ctx) {
        const employee = ctx.state.employee
        if (employee.role !== 'manager') return ctx.forbidden('FORBIDDEN_ROLE')
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const nextId = body?.employeeId == null ? null : Number(body.employeeId)

        const request = await strapi.db.query('api::request.request').findOne({ where: { id } })
        if (!request) return ctx.notFound()
        if (request.lockedAt) return ctx.badRequest('REQUEST_LOCKED')

        await strapi.db.query('api::request.request').update({
            where: { id },
            data: {
                assignee: nextId,
                acceptedById: nextId,
                acceptedAt: nextId ? new Date() : null,
            },
        })
        await strapi.service('api::request.request').logEvent(
            id,
            'reassigned',
            { from: request.acceptedById, to: nextId },
            employee.id,
        )

        ctx.body = { data: { ok: true } }
    },

    /** Переместить в другую колонку. */
    async move(ctx) {
        const employee = ctx.state.employee
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const columnId = Number(body?.columnId)
        if (!columnId) return ctx.badRequest('columnId required')
        const position = body?.position == null ? null : Number(body.position)

        const request = await strapi.db.query('api::request.request').findOne({
            where: { id },
            populate: ['assignee', 'column'],
        })
        if (!request) return ctx.notFound()
        if (!strapi.service('api::request.request').canMutate(request, employee)) {
            return ctx.forbidden('FORBIDDEN_ROLE')
        }

        try {
            const next = await strapi.service('api::request.request').moveRequest(
                id,
                columnId,
                position,
                employee.id,
            )
            ctx.body = { data: next }
        } catch (err: any) {
            if (err instanceof ApplicationError) return ctx.badRequest(err.message)
            strapi.log.error('[requests/move] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'move failed')
        }
    },

    /** Пакетный пересчёт позиций в колонке. */
    async reorder(ctx) {
        const employee = ctx.state.employee
        if (!['manager', 'duty'].includes(employee.role)) return ctx.forbidden('FORBIDDEN_ROLE')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const columnId = Number(body?.columnId)
        const orderedIds: number[] = Array.isArray(body?.orderedIds) ? body.orderedIds.map(Number) : []
        if (!columnId || !orderedIds.length) return ctx.badRequest('columnId and orderedIds required')

        for (let i = 0; i < orderedIds.length; i++) {
            await strapi.db.query('api::request.request').update({
                where: { id: orderedIds[i], column: columnId },
                data: { position: i + 1 },
            })
        }
        try {
            getRealtimeBus().publish({ scope: 'requests', type: 'request.reordered', columnId, actorId: employee.id })
        } catch (e: any) {
            strapi.log.warn('[realtime.publish] ' + (e?.message || e))
        }
        ctx.body = { data: { ok: true } }
    },

    /** Закрыть без заказа. */
    async lose(ctx) {
        const employee = ctx.state.employee
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const reason = String(body?.reason || '').trim()
        if (!reason) return ctx.badRequest('reason required')

        const request = await strapi.db.query('api::request.request').findOne({
            where: { id },
            populate: ['assignee'],
        })
        if (!request) return ctx.notFound()
        if (!strapi.service('api::request.request').canMutate(request, employee)) {
            return ctx.forbidden('FORBIDDEN_ROLE')
        }
        if (request.outcome !== 'open') return ctx.badRequest('REQUEST_NOT_OPEN')

        await strapi.db.query('api::request.request').update({
            where: { id },
            data: {
                outcome: 'lost',
                lostReason: reason,
                lostNote: body?.note || null,
            },
        })
        await strapi.service('api::request.request').logEvent(
            id,
            'lost',
            { reason, note: body?.note || null },
            employee.id,
        )
        ctx.body = { data: { ok: true } }
    },

    /** Переоткрыть (manager). Возвращает в колонку new без назначения. */
    async reopen(ctx) {
        const employee = ctx.state.employee
        if (employee.role !== 'manager') return ctx.forbidden('FORBIDDEN_ROLE')
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')

        const request = await strapi.db.query('api::request.request').findOne({ where: { id } })
        if (!request) return ctx.notFound()

        const newCol = await strapi.db
            .query('api::request-column.request-column')
            .findOne({ where: { kind: 'new' } })
        if (!newCol) return ctx.internalServerError('new column missing')

        const last = await strapi.db.query('api::request.request').findMany({
            where: { column: newCol.id },
            orderBy: { position: 'desc' as const },
            limit: 1,
            select: ['position'],
        })
        const position = (last[0]?.position ?? 0) + 1

        await strapi.db.query('api::request.request').update({
            where: { id },
            data: {
                outcome: 'open',
                lostReason: null,
                lostNote: null,
                acceptedById: null,
                acceptedAt: null,
                assignee: null,
                column: newCol.id,
                position,
                columnEnteredAt: new Date(),
            },
        })
        await strapi.service('api::request.request').ensureGoalStates(id, newCol.id)
        await strapi.service('api::request.request').logEvent(id, 'reopened', null, employee.id)
        ctx.body = { data: { ok: true } }
    },

    /** Переключить done у `request-goal-state`. */
    async toggleGoal(ctx) {
        const employee = ctx.state.employee
        const id = Number(ctx.params.id)
        const stateId = Number(ctx.params.stateId)
        if (!id || !stateId) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const done = Boolean(body?.done)

        const state = await strapi.db.query('api::request-goal-state.request-goal-state').findOne({
            where: { id: stateId, request: id },
        })
        if (!state) return ctx.notFound()

        const request = await strapi.db.query('api::request.request').findOne({
            where: { id },
            populate: ['assignee'],
        })
        if (!strapi.service('api::request.request').canMutate(request, employee)) {
            return ctx.forbidden('FORBIDDEN_ROLE')
        }

        await strapi.db.query('api::request-goal-state.request-goal-state').update({
            where: { id: stateId },
            data: { done, removed: false },
        })
        await strapi.service('api::request.request').logEvent(
            id,
            'goal-toggled',
            { stateId, done, goalText: state.goalText },
            employee.id,
        )
        ctx.body = { data: { ok: true } }
    },

    async removeGoal(ctx) {
        const employee = ctx.state.employee
        const id = Number(ctx.params.id)
        const stateId = Number(ctx.params.stateId)
        if (!id || !stateId) return ctx.badRequest('bad id')

        const request = await strapi.db.query('api::request.request').findOne({
            where: { id },
            populate: ['assignee'],
        })
        if (!strapi.service('api::request.request').canMutate(request, employee)) {
            return ctx.forbidden('FORBIDDEN_ROLE')
        }
        const state = await strapi.db.query('api::request-goal-state.request-goal-state').findOne({
            where: { id: stateId, request: id },
        })
        if (!state) return ctx.notFound()

        await strapi.db.query('api::request-goal-state.request-goal-state').update({
            where: { id: stateId },
            data: { removed: true, done: false },
        })
        await strapi.service('api::request.request').logEvent(
            id,
            'goal-removed',
            { stateId, goalText: state.goalText },
            employee.id,
        )
        ctx.body = { data: { ok: true } }
    },

    /** Создание заказа из заявки. */
    async convert(ctx) {
        const employee = ctx.state.employee
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')

        const request = await strapi.db.query('api::request.request').findOne({
            where: { id },
            populate: ['assignee', 'column', 'order'],
        })
        if (!request) return ctx.notFound()
        if (!strapi.service('api::request.request').canMutate(request, employee)) {
            return ctx.forbidden('FORBIDDEN_ROLE')
        }
        if (request.order?.id || request.outcome === 'converted' || request.lockedAt) {
            return ctx.conflict('REQUEST_ALREADY_CONVERTED')
        }
        if (request.outcome !== 'open') return ctx.badRequest('REQUEST_NOT_OPEN')

        const body = (ctx.request.body?.data || ctx.request.body) as any
        if (!body?.items?.length) return ctx.badRequest('items are required')

        // Клиентский блок: имя/телефон/адрес/координаты. Телефон при отсутствии берём из заявки.
        const clientInput = {
            fullName: body?.client?.fullName ?? request.name,
            phone: body?.client?.phone || request.phone,
            address: body?.client?.address ?? body?.address ?? null,
            lat: body?.client?.lat ?? body?.lat ?? null,
            lng: body?.client?.lng ?? body?.lng ?? null,
        }

        try {
            const order = await strapi.service('api::order.order').buildAndCreate(
                {
                    client: clientInput,
                    items: body.items,
                    paymentMethod: body.paymentMethod,
                    deliveryMethod: body.deliveryMethod,
                    deliverySlotAt: body.deliverySlotAt,
                    comment: body.comment ?? request.comment,
                    address: body.address ?? null,
                    lat: body.lat ?? null,
                    lng: body.lng ?? null,
                },
                {
                    source: 'request',
                    createdById: employee.id,
                    requestId: request.id,
                },
            )

            // Блокируем заявку и фиксируем исход.
            await strapi.db.query('api::request.request').update({
                where: { id: request.id },
                data: {
                    outcome: 'converted',
                    lockedAt: new Date(),
                },
            })
            await strapi.service('api::request.request').logEvent(
                request.id,
                'converted',
                { orderCode: order.code },
                employee.id,
            )

            ctx.body = { data: order }
        } catch (err: any) {
            if (err?.message === 'REQUEST_ALREADY_CONVERTED') {
                return ctx.conflict('REQUEST_ALREADY_CONVERTED')
            }
            if (err instanceof ApplicationError) return ctx.badRequest(err.message)
            strapi.log.error('[requests/convert] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'convert failed')
        }
    },

    /** Восстановить все цели заявки (removed → false). */
    async restoreGoals(ctx) {
        const employee = ctx.state.employee
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const request = await strapi.db.query('api::request.request').findOne({
            where: { id },
            populate: ['assignee', 'column'],
        })
        if (!request) return ctx.notFound()
        if (!strapi.service('api::request.request').canMutate(request, employee)) {
            return ctx.forbidden('FORBIDDEN_ROLE')
        }

        const removed = await strapi.db
            .query('api::request-goal-state.request-goal-state')
            .findMany({ where: { request: id, removed: true }, select: ['id'] })
        for (const s of removed) {
            await strapi.db.query('api::request-goal-state.request-goal-state').update({
                where: { id: s.id },
                data: { removed: false },
            })
        }
        if (request.column?.id) {
            await strapi.service('api::request.request').ensureGoalStates(id, request.column.id)
        }
        await strapi.service('api::request.request').logEvent(id, 'goals-restored', null, employee.id)
        ctx.body = { data: { ok: true } }
    },
}))
