export default {
    routes: [
        {
            method: 'POST',
            path: '/clients/sign-in',
            handler: 'api::client.client.signIn',
            config: { auth: false },
        },
    ],
}
