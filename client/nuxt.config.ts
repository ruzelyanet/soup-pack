import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
    compatibilityDate: '2025-01-01',
    // DevTools-панель только в dev; в prod билде Nuxt её не включает в любом случае.
    devtools: { enabled: process.env.NODE_ENV !== 'production' },
    modules: ['@pinia/nuxt', '@primevue/nuxt-module', '@nuxtjs/sitemap', 'nuxt-schema-org'],

    site: { url: process.env.NUXT_PUBLIC_SITE_URL || 'https://soup-pack.uz' },

    sitemap: {
        sources: ['/api/__sitemap__/urls'],
        exclude: ['/checkout', '/cart', '/account', '/login', '/success/**', '/order/**', '/f/**'],
    },

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
            // Адрес сайта для canonical и og:url (превью ссылок в Telegram/соцсетях).
            // По умолчанию — прод; переопределяется NUXT_PUBLIC_SITE_URL (для локалки — http://localhost:3000).
            siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://soup-pack.uz',
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
                { name: 'theme-color', content: '#FFF4E2' },
            ],
            link: [
                { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
            ],
        },
    },

    routeRules: {
        '/promotions': { redirect: '/discounts' },
        '/promotions/**': { redirect: '/discounts' },
    },
})
