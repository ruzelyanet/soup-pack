export default {
    routes: [
        {
            method: 'POST',
            path: '/orders/place',
            handler: 'api::order.order.place',
            config: {
                auth: false,
            },
        },
    ],
}
