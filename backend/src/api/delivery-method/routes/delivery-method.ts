import { factories } from '@strapi/strapi'

const publicRead = { policies: ['global::public-catalog'], auth: false as const }
const staffMgr = {
    policies: [{ name: 'global::is-staff', config: { roles: ['manager'] } }],
    auth: false as const,
}

export default factories.createCoreRouter('api::delivery-method.delivery-method', {
    config: {
        find:    publicRead, // клиент на чекауте должен видеть активные способы
        findOne: publicRead,
        create:  staffMgr,
        update:  staffMgr,
        delete:  staffMgr,
    },
})
