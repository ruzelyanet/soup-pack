const staff = { policies: ['global::is-staff'], auth: false as const }

export default {
    routes: [
        { method: 'GET',    path: '/staff/order-sets',     handler: 'api::order-set.order-set.find',    config: staff },
        { method: 'GET',    path: '/staff/order-sets/:id', handler: 'api::order-set.order-set.findOne', config: staff },
        { method: 'POST',   path: '/staff/order-sets',     handler: 'api::order-set.order-set.create',  config: staff },
        { method: 'PUT',    path: '/staff/order-sets/:id', handler: 'api::order-set.order-set.update',  config: staff },
        { method: 'DELETE', path: '/staff/order-sets/:id', handler: 'api::order-set.order-set.delete',  config: staff },
    ],
}
