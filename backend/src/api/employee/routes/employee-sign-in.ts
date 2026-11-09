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
    ],
}
