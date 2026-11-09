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
}))
