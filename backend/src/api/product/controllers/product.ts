import { factories } from '@strapi/strapi'

/** Переопределяем find/findOne чтобы приклеить `pricing` (базовая/финальная цена, скидка) из движка. */
export default factories.createCoreController('api::product.product', ({ strapi }) => ({
    async find(ctx: any) {
        // @ts-ignore — super() доступен в proxy createCoreController, не в типах.
        const { data, meta } = await super.find(ctx)
        if (!Array.isArray(data)) return { data, meta }
        const ids = data.map((d: any) => d.id).filter(Boolean)
        if (!ids.length) return { data, meta }
        const { products } = await strapi.service('api::price.pricing').catalogPricing({ productIds: ids })
        for (const d of data) d.pricing = products[d.id] || null
        return { data, meta }
    },
    async findOne(ctx: any) {
        // @ts-ignore
        const { data, meta } = await super.findOne(ctx)
        if (data?.id) {
            const { products } = await strapi.service('api::price.pricing').catalogPricing({ productIds: [data.id] })
            data.pricing = products[data.id] || null
        }
        return { data, meta }
    },
}))
