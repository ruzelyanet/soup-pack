import type { Core } from '@strapi/strapi'
import { errors } from '@strapi/utils'

const { ApplicationError } = errors

/** Контроллер управляет только HTTP-слоем — вся логика в сервисе `api::price.pricing`. */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
    /** История и плановые цены товара. */
    async listForProduct(ctx: any) {
        const productId = Number(ctx.params?.id)
        if (!productId) return ctx.badRequest('bad product id')
        const rows = await strapi.service('api::price.pricing').listPrices(productId)
        ctx.body = { data: rows }
    },

    /** Создать новую цену (менеджер). Тело: { amount, validFrom?, comment? }. */
    async createForProduct(ctx: any) {
        const productId = Number(ctx.params?.id)
        if (!productId) return ctx.badRequest('bad product id')
        const body = (ctx.request.body?.data || ctx.request.body) as any
        const employeeId = ctx.state?.employee?.id ?? null
        try {
            const result = await strapi.service('api::price.pricing').setPrice({
                productId,
                amount: Number(body?.amount || 0),
                validFrom: body?.validFrom || null,
                comment: body?.comment || null,
                employeeId,
            })
            ctx.body = { data: result }
        } catch (err: any) {
            if (err instanceof ApplicationError) {
                return ctx.badRequest(err.message, err.details || {})
            }
            strapi.log.error('[pricing/create] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'set price failed')
        }
    },

    /** Отменить ещё не наступившую плановую цену. */
    async deleteFuture(ctx: any) {
        const priceId = Number(ctx.params?.id)
        if (!priceId) return ctx.badRequest('bad price id')
        try {
            await strapi.service('api::price.pricing').cancelFuturePrice(priceId)
            ctx.body = { data: { ok: true } }
        } catch (err: any) {
            if (err instanceof ApplicationError) {
                return ctx.badRequest(err.message, err.details || {})
            }
            strapi.log.error('[pricing/delete-future] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'cancel price failed')
        }
    },

    /** Публичный расчёт корзины: POST /api/pricing/quote. */
    async publicQuote(ctx: any) {
        const body = (ctx.request.body?.data || ctx.request.body) as any
        try {
            const quote = await strapi.service('api::price.pricing').quote({
                items: body?.items || [],
                deliveryMethod: body?.deliveryMethod,
                paymentMethod: body?.paymentMethod,
                source: 'catalog',
            })
            ctx.body = { data: quote }
        } catch (err: any) {
            if (err instanceof ApplicationError) {
                return ctx.badRequest(err.message, err.details || {})
            }
            strapi.log.error('[pricing/quote] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'quote failed')
        }
    },

    /** Simulate для staff: тот же quote, но с source=manual и возвращает explanations. */
    async simulate(ctx: any) {
        const body = (ctx.request.body?.data || ctx.request.body) as any
        try {
            const quote = await strapi.service('api::price.pricing').quote({
                items: body?.items || [],
                deliveryMethod: body?.deliveryMethod,
                paymentMethod: body?.paymentMethod,
                source: body?.source || 'manual',
                includeDiscountIds: Array.isArray(body?.includeDiscountIds)
                    ? body.includeDiscountIds.map(Number).filter(Boolean)
                    : undefined,
            })
            ctx.body = { data: quote }
        } catch (err: any) {
            if (err instanceof ApplicationError) {
                return ctx.badRequest(err.message, err.details || {})
            }
            strapi.log.error('[pricing/simulate] ' + (err?.message || err))
            return ctx.internalServerError(err?.message || 'simulate failed')
        }
    },
})
