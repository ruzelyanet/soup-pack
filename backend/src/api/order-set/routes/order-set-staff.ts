const staff = { policies: ['global::is-staff'], auth: false as const }

export default {
    routes: [
        { method: 'GET',    path: '/staff/order-sets',     handler: 'api::order-set.order-set.findAllStatuses', config: staff },
        { method: 'GET',    path: '/staff/order-sets/:id', handler: 'api::order-set.order-set.findOne', config: staff },
        { method: 'POST',   path: '/staff/order-sets',     handler: 'api::order-set.order-set.create',  config: staff },
        { method: 'PUT',    path: '/staff/order-sets/:id', handler: 'api::order-set.order-set.update',  config: staff },
        { method: 'DELETE', path: '/staff/order-sets/:id', handler: 'api::order-set.order-set.delete',  config: staff },
        { method: 'POST',   path: '/staff/order-sets/:id/actions/publish',   handler: 'api::order-set.order-set.publish',   config: staff },
        { method: 'POST',   path: '/staff/order-sets/:id/actions/unpublish', handler: 'api::order-set.order-set.unpublish', config: staff },
    ],
}
