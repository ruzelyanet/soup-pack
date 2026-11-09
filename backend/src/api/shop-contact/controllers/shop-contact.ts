import { factories } from '@strapi/strapi'

const UID = 'api::shop-contact.shop-contact' as const

/** Single-type без seed'а: пока админ ни разу не сохранял, записи нет.
 *  Отдаём пустой объект (а не 404). Update делаем upsert'ом, чтобы первое
 *  «Сохранить» создавало документ. */
export default factories.createCoreController(UID, ({ strapi }) => ({
    async find(ctx) {
        const entity = await strapi.documents(UID).findFirst({})
        ctx.body = {
            data: entity || { phone: '', workHours: '', city: '' },
        }
    },

    async update(ctx) {
        const body = ((ctx.request.body as any)?.data ?? {}) as {
            phone?: string; workHours?: string; city?: string
        }
        const data = {
            phone:     body.phone     ?? '',
            workHours: body.workHours ?? '',
            city:      body.city      ?? '',
        }

        const existing = await strapi.documents(UID).findFirst({})
        const saved = existing
            ? await strapi.documents(UID).update({ documentId: existing.documentId, data })
            : await strapi.documents(UID).create({ data })

        ctx.body = { data: saved }
    },
}))
