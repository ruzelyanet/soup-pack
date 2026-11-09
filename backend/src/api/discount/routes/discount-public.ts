export default {
    routes: [
        { method: 'GET', path: '/discounts/public',  handler: 'api::discount.discount.publicList', config: { auth: false } },
        // @deprecated Один релиз — алиас со старого пути /promotions/public.
        { method: 'GET', path: '/promotions/public', handler: 'api::discount.discount.publicList', config: { auth: false } },
    ],
}
