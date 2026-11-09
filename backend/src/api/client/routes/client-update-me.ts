export default {
    routes: [
        {
            method: 'POST',
            path: '/clients/update-me',
            handler: 'api::client.client.updateMe',
            config: { auth: false },
        },
    ],
}
