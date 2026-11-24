import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
    compatibilityDate: '2025-01-01',
    devtools: { enabled: true },
    modules: ['@pinia/nuxt', '@primevue/nuxt-module'],

    css: ['~/assets/css/main.css'],

    vite: {
        plugins: [tailwindcss()],
    },

    runtimeConfig: {
        // server-side only (на сервере ходим во внутренний URL Strapi, если задан)
        apiUrlInternal: '',
        apiToken: '',
        public: {
            // клиент видит публичный URL
            apiUrl: 'http://localhost:1437',
            apiToken: '',
            siteUrl: 'http://localhost:3000',
        },
    },

    primevue: {
        importTheme: { from: '~/theme/preset.ts', name: 'SoupPuckPreset' },
        options: {
            ripple: true,
            theme: {
                options: {
                    darkModeSelector: '.dark',
                    cssLayer: {
                        name: 'primevue',
                        order: 'theme, base, primevue, utilities',
                    },
                },
            },
        },
    },

    app: {
        head: {
            htmlAttrs: { lang: 'ru' },
            meta: [
                { charset: 'utf-8' },
                { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
            ],
        },
    },

    routeRules: {
        '/promotions': { redirect: '/discounts' },
        '/promotions/**': { redirect: '/discounts' },
    },
})
