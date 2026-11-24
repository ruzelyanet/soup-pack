const staff = {
    policies: [{ name: 'global::is-staff', config: { roles: ['manager', 'duty'] } }],
    auth: false as const,
}

export default {
    routes: [
        { method: 'GET', path: '/clients/:documentId/stats', handler: 'api::client.client.stats', config: staff },
    ],
}
