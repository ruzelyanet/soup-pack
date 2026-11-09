export default {
    routes: [
        {
            method: 'POST',
            path: '/orders/mine',
            handler: 'api::order.order.mine',
            config: { auth: false },
        },
    ],
}
