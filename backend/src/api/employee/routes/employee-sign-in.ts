export default {
    routes: [
        {
            method: 'POST',
            path: '/staff/sign-in',
            handler: 'api::employee.employee.signIn',
            config: { auth: false },
        },
        {
            method: 'GET',
            path: '/staff/me',
            handler: 'api::employee.employee.me',
            config: { auth: false, policies: ['global::is-staff'] },
        },
        {
            method: 'POST',
            path: '/employees/:documentId/regenerate-key',
            handler: 'api::employee.employee.regenerateKey',
            config: {
                auth: false,
                policies: [{ name: 'global::is-staff', config: { roles: ['manager'] } }],
            },
        },
        {
            method: 'GET',
            path: '/employees/:documentId/stats',
            handler: 'api::employee.employee.stats',
            config: {
                auth: false,
                policies: [{ name: 'global::is-staff', config: { roles: ['manager'] } }],
            },
        },
    ],
}
