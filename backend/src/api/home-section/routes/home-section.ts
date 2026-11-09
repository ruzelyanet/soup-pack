import { factories } from '@strapi/strapi'

const staff = { policies: ['global::is-staff'], auth: false as const }
const publicRead = { policies: ['global::public-catalog'], auth: false as const }

export default factories.createCoreRouter('api::home-section.home-section', {
    config: {
        find:    publicRead,
        findOne: publicRead,
        create:  staff,
        update:  staff,
        delete:  staff,
    },
})
