import { factories } from '@strapi/strapi'

/** Все CRUD-роуты employee закрыты policy is-staff; только manager. */
const staffOnly = {
    policies: [{ name: 'global::is-staff', config: { roles: ['manager'] } }],
    auth: false as const,
}

export default factories.createCoreRouter('api::employee.employee', {
    config: {
        find:    staffOnly,
        findOne: staffOnly,
        create:  staffOnly,
        update:  staffOnly,
        delete:  staffOnly,
    },
})
