const staff = {
    policies: ['global::is-staff'],
    auth: false as const,
}

export default {
    routes: [
        { method: 'POST', path: '/staff/orders',         handler: 'api::order.order.createManual', config: staff },
        { method: 'POST', path: '/staff/orders/preview', handler: 'api::order.order.preview',      config: staff },
        { method: 'POST', path: '/staff/orders/:id/take',handler: 'api::order.order.take',         config: staff },
        { method: 'PUT',  path: '/staff/orders/:id/edit',  handler: 'api::order.order.edit',     config: staff },
        { method: 'POST', path: '/staff/orders/:id/cancel',handler: 'api::order.order.cancel',   config: staff },
        { method: 'GET',  path: '/staff/dashboard',      handler: 'api::order.order.dashboard',    config: staff },
        { method: 'POST', path: '/staff/upload',         handler: 'api::order.order.staffUpload',  config: staff },
    ],
}
