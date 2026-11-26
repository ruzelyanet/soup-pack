/**
 * Район заказа заполняется автоматически:
 *  - при создании — сразу из адреса, если там есть район; иначе фоном через геокодер Яндекса;
 *  - при смене адреса/координат — сбрасываем и определяем заново.
 * Оформление заказа геокодер не задерживает: сетевой запрос идёт после ответа.
 */
import { districtFromText, resolveOrderDistrict } from '../../../../utils/district'

const UID = 'api::order.order'
const app = () => (global as any).strapi

function touchesPlace(data: any): boolean {
    return data && ('address' in data || 'lat' in data || 'lng' in data)
}

function resolveInBackground(row: any) {
    if (!row?.id || row.district != null) return
    if (row.lat == null && !row.address) return
    setImmediate(async () => {
        try {
            const district = await resolveOrderDistrict(row)
            await app().db.query(UID).update({ where: { id: row.id }, data: { district } })
        } catch (e: any) {
            // Ключа нет / геокодер недоступен — оставляем null, админка дозаполнит позже.
            app()?.log?.warn(`[order.district] #${row.id}: ${e?.message || e}`)
        }
    })
}

export default {
    beforeCreate(event: any) {
        const data = event.params?.data
        if (!data || data.district != null) return
        const d = districtFromText(data.address)
        if (d) data.district = d
    },
    afterCreate(event: any) {
        resolveInBackground(event.result)
    },
    beforeUpdate(event: any) {
        const data = event.params?.data
        if (!touchesPlace(data) || 'district' in data) return
        data.district = districtFromText(data.address) ?? null
    },
    afterUpdate(event: any) {
        if (touchesPlace(event.params?.data)) resolveInBackground(event.result)
    },
}
