import { factories } from '@strapi/strapi'

/** CRUD заказов — только для авторизованного сотрудника.
 *  Публичные операции (place, mine) объявлены отдельными файлами. */
const staff = {
    policies: ['global::is-staff'],
    auth: false as const,
}

export default factories.createCoreRouter('api::order.order', {
    config: {
        find:    staff,
        findOne: staff,
        create:  staff,
        update:  staff,
        delete:  staff,
    },
})
