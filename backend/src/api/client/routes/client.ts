import { factories } from '@strapi/strapi'

/** CRUD клиентов — только staff. Публичные `signIn` и `updateMe` в отдельных файлах. */
const staff = {
    policies: ['global::is-staff'],
    auth: false as const,
}

export default factories.createCoreRouter('api::client.client', {
    config: {
        find:    staff,
        findOne: staff,
        create:  staff,
        update:  staff,
        delete:  staff,
    },
})
