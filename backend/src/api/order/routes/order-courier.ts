const courierOnly = {
    policies: [{ name: 'global::is-staff', config: { roles: ['courier'] } }],
    auth: false as const,
}

const dispatchOnly = {
    policies: [{ name: 'global::is-staff', config: { roles: ['manager', 'duty'] } }],
    auth: false as const,
}

export default {
    routes: [
        { method: 'GET',  path: '/courier/orders',                     handler: 'api::order.order.courierList',    config: courierOnly },
        { method: 'POST', path: '/courier/orders/:documentId/accept',  handler: 'api::order.order.courierAccept',  config: courierOnly },
        { method: 'POST', path: '/courier/orders/:documentId/confirm', handler: 'api::order.order.courierConfirm', config: courierOnly },
        { method: 'POST', path: '/staff/orders/:documentId/dispatch',  handler: 'api::order.order.dispatch',       config: dispatchOnly },
    ],
}
