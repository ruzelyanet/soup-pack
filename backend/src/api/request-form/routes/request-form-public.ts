export default {
    routes: [
        {
            method: 'GET',
            path: '/request-forms/public/:slug',
            handler: 'api::request-form.request-form.getPublic',
            config: { auth: false },
        },
        {
            method: 'POST',
            path: '/request-forms/:slug/submit',
            handler: 'api::request-form.request-form.submit',
            config: { auth: false },
        },
    ],
}
