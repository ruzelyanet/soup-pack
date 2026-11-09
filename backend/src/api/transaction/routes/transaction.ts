const staff = {
    policies: ['global::is-staff'],
    auth: false as const,
}

export default {
    routes: [
        { method: 'POST', path: '/staff/orders/:id/payments',      handler: 'api::transaction.transaction.createPayment', config: staff },
        { method: 'POST', path: '/staff/orders/:id/refunds',       handler: 'api::transaction.transaction.createRefund',  config: staff },
        { method: 'GET',  path: '/staff/transactions',             handler: 'api::transaction.transaction.list',          config: staff },
        { method: 'GET',  path: '/staff/transactions/summary',     handler: 'api::transaction.transaction.summary',       config: staff },
        { method: 'POST', path: '/staff/transactions/:id/cancel',  handler: 'api::transaction.transaction.cancelOne',     config: staff },
    ],
}
