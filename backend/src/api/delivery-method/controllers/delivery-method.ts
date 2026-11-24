import { factories } from '@strapi/strapi'

/** Прикрепляем превью лучшей активной скидки к каждому способу доставки:
 *  { preview: { benefitType, benefitValue, label } | null }.
 *  Берём только order-level скидки, у которых в conditions.deliveryMethods есть code. */
async function attachDiscountPreview(strapi: any, methods: any[]): Promise<any[]> {
    if (!methods.length) return methods
    try {
        const now = new Date()
        const discounts: any[] = await strapi.db.query('api::discount.discount').findMany({
            where: {
                status: 'active',
                level: 'order',
                $or: [
                    { startsAt: null },
                    { startsAt: { $lte: now } },
                ],
            },
        })
        const byCode = new Map<string, any>()
        for (const m of methods) {
            // Только активные во времени.
            const candidates = discounts.filter((d) => {
                if (d.endsAt && new Date(d.endsAt) < now) return false
                const codes = d.conditions?.deliveryMethods as string[] | undefined
                return Array.isArray(codes) && codes.length && codes.includes(m.code)
            })
            if (!candidates.length) continue
            // Выбираем «лучшую» — по убыванию benefitValue.
            candidates.sort((a, b) => Number(b.benefitValue || 0) - Number(a.benefitValue || 0))
            const best = candidates[0]
            byCode.set(m.code, {
                benefitType: best.benefitType,
                benefitValue: Number(best.benefitValue || 0),
                label: (best.publicLabel || best.name || '').trim(),
                minSubtotal: Number(best.conditions?.minSubtotal || 0) || null,
            })
        }
        return methods.map((m) => ({ ...m, preview: byCode.get(m.code) || null }))
    } catch {
        return methods.map((m) => ({ ...m, preview: null }))
    }
}

export default factories.createCoreController('api::delivery-method.delivery-method', ({ strapi }) => ({
    async find(ctx: any) {
        // @ts-ignore — super доступен в proxy createCoreController.
        const { data, meta } = await super.find(ctx)
        if (!Array.isArray(data)) return { data, meta }
        const withPreview = await attachDiscountPreview(strapi, data as any[])
        return { data: withPreview, meta }
    },
}))
