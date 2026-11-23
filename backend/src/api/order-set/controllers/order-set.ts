import { factories } from '@strapi/strapi'

/** Переопределяем find/findOne чтобы приклеить `pricing` для набора (цена + скидка набора). */
export default factories.createCoreController('api::order-set.order-set', ({ strapi }) => ({
    async find(ctx: any) {
        // @ts-ignore
        const { data, meta } = await super.find(ctx)
        if (!Array.isArray(data)) return { data, meta }
        const ids = data.map((d: any) => d.id).filter(Boolean)
        if (!ids.length) return { data, meta }
        const { orderSets } = await strapi.service('api::price.pricing').catalogPricing({ orderSetIds: ids })
        for (const d of data) d.pricing = orderSets[d.id] || null
        return { data, meta }
    },
    async findOne(ctx: any) {
        // @ts-ignore
        const { data, meta } = await super.findOne(ctx)
        if (data?.id) {
            const { orderSets } = await strapi.service('api::price.pricing').catalogPricing({ orderSetIds: [data.id] })
            data.pricing = orderSets[data.id] || null
        }
        return { data, meta }
    },
    /** Для staff-эндпоинта: показывать и draft и published (объединяя версии по documentId). */
    async findAllStatuses(ctx: any) {
        const q = ctx.query || {}
        const base = { populate: q.populate, filters: q.filters, sort: q.sort }
        const docs = strapi.documents('api::order-set.order-set' as any)
        const [pub, drf] = await Promise.all([
            docs.findMany({ ...base, status: 'published' }),
            docs.findMany({ ...base, status: 'draft' }),
        ])
        // В v5 draft и published — две версии одного documentId. Берём published, иначе draft.
        const map = new Map<string, any>()
        for (const d of drf) map.set(d.documentId, d)
        for (const d of pub) map.set(d.documentId, d)
        const data = Array.from(map.values())
        if (data.length) {
            const { orderSets } = await strapi.service('api::price.pricing').catalogPricing({ orderSetIds: data.map((d) => d.id) })
            for (const d of data) d.pricing = orderSets[d.id] || null
        }
        return { data, meta: { pagination: { total: data.length } } }
    },
    async publish(ctx: any) {
        const documentId = ctx.params.id
        try {
            const result = await strapi.documents('api::order-set.order-set' as any).publish({ documentId })
            return { data: result }
        } catch (err: any) {
            strapi.log.error('[order-set.publish]', { documentId, err: err?.message, stack: err?.stack })
            return ctx.throw(500, err?.message || 'publish failed')
        }
    },
    async unpublish(ctx: any) {
        const documentId = ctx.params.id
        try {
            // В Strapi 5 unpublish падает, если документа нет или он уже draft;
            // сначала проверим наличие published-версии.
            const existing = await strapi.documents('api::order-set.order-set' as any).findOne({
                documentId,
                status: 'published',
            })
            if (!existing) {
                return { data: { documentId, alreadyDraft: true } }
            }
            const result = await strapi.documents('api::order-set.order-set' as any).unpublish({ documentId })
            return { data: result }
        } catch (err: any) {
            strapi.log.error('[order-set.unpublish]', { documentId, err: err?.message, stack: err?.stack })
            return ctx.throw(500, err?.message || 'unpublish failed')
        }
    },
}))
