const staff = { policies: ['global::is-staff'], auth: false as const }

/** Single-type: нет :id. find возвращает единственную запись, update обновляет её. */
export default {
    routes: [
        { method: 'GET', path: '/staff/shop-contact', handler: 'api::shop-contact.shop-contact.find',   config: staff },
        { method: 'PUT', path: '/staff/shop-contact', handler: 'api::shop-contact.shop-contact.update', config: staff },
    ],
}
