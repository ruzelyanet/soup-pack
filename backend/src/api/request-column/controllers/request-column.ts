import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::request-column.request-column' as any, ({ strapi }: any) => ({
    /** Все колонки с количеством активных заявок. */
    async listAll(ctx) {
        const columns = await strapi.db.query('api::request-column.request-column').findMany({
            orderBy: { position: 'asc' as const },
            limit: 100,
        })
        const counts: Record<number, number> = {}
        for (const c of columns) {
            counts[c.id] = await strapi.db.query('api::request.request').count({
                where: { column: c.id, archived: false, outcome: 'open' },
            })
        }
        ctx.body = {
            data: columns.map((c: any) => ({ ...c, requestsCount: counts[c.id] || 0 })),
        }
    },

    async createOne(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const name = String(body?.name || '').trim()
        if (!name) return ctx.badRequest('name required')

        // Куда вставлять — перед колонкой `done`.
        const done = await strapi.db.query('api::request-column.request-column').findOne({ where: { kind: 'done' } })
        const customs = await strapi.db.query('api::request-column.request-column').findMany({
            where: { kind: 'custom' },
            orderBy: { position: 'desc' as const },
            limit: 1,
        })
        const lastCustomPos = customs[0]?.position ?? 1
        const position = lastCustomPos + 1
        // Сдвигаем done.
        if (done && done.position <= position) {
            await strapi.db.query('api::request-column.request-column').update({
                where: { id: done.id },
                data: { position: position + 1 },
            })
        }

        const created = await strapi.db.query('api::request-column.request-column').create({
            data: {
                name,
                color: body?.color || null,
                kind: 'custom',
                position,
                requireGoals: Boolean(body?.requireGoals),
                publishedAt: new Date(),
            },
        })
        ctx.body = { data: created }
    },

    async updateOne(ctx) {
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any

        const col = await strapi.db.query('api::request-column.request-column').findOne({ where: { id } })
        if (!col) return ctx.notFound()

        const patch: Record<string, any> = {}
        if ('name' in body) patch.name = String(body.name).trim()
        if ('color' in body) patch.color = body.color || null
        if ('requireGoals' in body) patch.requireGoals = Boolean(body.requireGoals)
        // Удалять нельзя new/done, но переименовать/перекрасить можно — kind не меняется.
        const updated = await strapi.db.query('api::request-column.request-column').update({
            where: { id },
            data: patch,
        })
        ctx.body = { data: updated }
    },

    async deleteOne(ctx) {
        const id = Number(ctx.params.id)
        if (!id) return ctx.badRequest('bad id')
        const col = await strapi.db.query('api::request-column.request-column').findOne({ where: { id } })
        if (!col) return ctx.notFound()
        if (col.kind !== 'custom') return ctx.badRequest('PROTECTED_COLUMN')
        const count = await strapi.db.query('api::request.request').count({
            where: { column: id, archived: false, outcome: 'open' },
        })
        if (count > 0) return ctx.badRequest('COLUMN_NOT_EMPTY')
        // Удаляем связанные цели (goal-states на этой колонке остаются как замороженные).
        await strapi.db.query('api::request-goal.request-goal').deleteMany({ where: { column: id } })
        await strapi.db.query('api::request-column.request-column').delete({ where: { id } })
        ctx.body = { data: { ok: true } }
    },

    /** Пакетный пересчёт позиций. Фиксированные `new`/`done` на краях. */
    async reorder(ctx) {
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const orderedIds: number[] = Array.isArray(body?.orderedIds) ? body.orderedIds.map(Number) : []
        if (!orderedIds.length) return ctx.badRequest('orderedIds required')

        const all = await strapi.db.query('api::request-column.request-column').findMany({
            orderBy: { position: 'asc' as const },
            limit: 100,
        })
        const newCol = all.find((c: any) => c.kind === 'new')
        const doneCol = all.find((c: any) => c.kind === 'done')
        if (!newCol || !doneCol) return ctx.internalServerError('bootstrap missing')

        // new всегда 1, done — последний. Custom размещаются между 2 и N-1 в порядке orderedIds.
        await strapi.db.query('api::request-column.request-column').update({
            where: { id: newCol.id }, data: { position: 1 },
        })
        let pos = 2
        for (const id of orderedIds) {
            if (id === newCol.id || id === doneCol.id) continue
            await strapi.db.query('api::request-column.request-column').update({
                where: { id }, data: { position: pos++ },
            })
        }
        await strapi.db.query('api::request-column.request-column').update({
            where: { id: doneCol.id }, data: { position: pos },
        })
        ctx.body = { data: { ok: true } }
    },

    // --- Цели колонки ---

    async listGoals(ctx) {
        const columnId = Number(ctx.params.id)
        if (!columnId) return ctx.badRequest('bad id')
        const rows = await strapi.db.query('api::request-goal.request-goal').findMany({
            where: { column: columnId },
            orderBy: { position: 'asc' as const },
            limit: 100,
        })
        ctx.body = { data: rows }
    },

    async createGoal(ctx) {
        const columnId = Number(ctx.params.id)
        if (!columnId) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const text = String(body?.text || '').trim()
        if (!text) return ctx.badRequest('text required')

        const last = await strapi.db.query('api::request-goal.request-goal').findMany({
            where: { column: columnId },
            orderBy: { position: 'desc' as const },
            limit: 1,
            select: ['position'],
        })
        const position = (last[0]?.position ?? 0) + 1

        const created = await strapi.db.query('api::request-goal.request-goal').create({
            data: { column: columnId, text, position, publishedAt: new Date() },
        })

        // Для всех заявок в этой колонке — создать goal-state.
        const inColumn = await strapi.db.query('api::request.request').findMany({
            where: { column: columnId, archived: false, outcome: 'open' },
            select: ['id'],
        })
        for (const r of inColumn) {
            await strapi.service('api::request.request').ensureGoalStates(r.id, columnId)
        }
        ctx.body = { data: created }
    },

    async updateGoal(ctx) {
        const goalId = Number(ctx.params.goalId)
        if (!goalId) return ctx.badRequest('bad id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const patch: Record<string, any> = {}
        if ('text' in body) patch.text = String(body.text).trim()
        if ('position' in body) patch.position = Number(body.position)
        const updated = await strapi.db.query('api::request-goal.request-goal').update({
            where: { id: goalId },
            data: patch,
        })
        ctx.body = { data: updated }
    },

    async deleteGoal(ctx) {
        const goalId = Number(ctx.params.goalId)
        if (!goalId) return ctx.badRequest('bad id')
        // Удалённую цель прячем от будущих заявок, но прошлые goal-state с ней остаются (у них снимок goalText).
        await strapi.db.query('api::request-goal.request-goal').delete({ where: { id: goalId } })
        ctx.body = { data: { ok: true } }
    },
}))
