export default {
    routes: [
        {
            method: 'POST',
            path: '/clients/lookup',
            handler: 'api::client.client.lookup',
            config: { auth: false },
        },
    ],
}
