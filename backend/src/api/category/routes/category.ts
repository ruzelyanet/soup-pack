import { factories } from '@strapi/strapi'

/** find/findOne остаются публичными (нужны каталогу), запись — только staff. */
const staff = { policies: ['global::is-staff'], auth: false as const }
const publicRead = { policies: ['global::public-catalog'], auth: false as const }

export default factories.createCoreRouter('api::category.category', {
    config: {
        find:    publicRead,
        findOne: publicRead,
        create:  staff,
        update:  staff,
        delete:  staff,
    },
})
