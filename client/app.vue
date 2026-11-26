<script setup lang="ts">
const route = useRoute()

/** Адрес сайта для canonical / og:url. localhost на проде — всегда ошибка настройки
 *  (например, NUXT_PUBLIC_SITE_URL скопирован из .env.example) — тогда берём боевой домен. */
const PROD_URL = 'https://soup-pack.uz'
const configured = String(useRuntimeConfig().public.siteUrl || '').replace(/\/$/, '')
const siteUrl = !import.meta.dev && (!configured || /localhost|127\.0\.0\.1/.test(configured)) ? PROD_URL : configured

useHead({
    link: [{ rel: 'canonical', href: () => siteUrl + route.path }],
    meta: [{ property: 'og:url', content: () => siteUrl + route.path }],
})

/** Общие теги превью ссылок (Telegram, WhatsApp, соцсети). Страницы со своими
 *  title/description/картинкой (товар, набор, скидка) перекрывают их своим useSeoMeta. */
useSeoMeta({
    ogSiteName: 'SOUP PACK',
    ogLocale: 'ru_RU',
    ogType: 'website',
    ogTitle: 'SOUP PACK — готовые супы с доставкой в Ташкенте',
    ogDescription: 'Вкусная ресторанная еда от шеф-повара: супы и пасты с доставкой по Ташкенту. Разогрев — 5 минут.',
    ogImage: `${siteUrl}/og.jpg`,
    ogImageWidth: 1052,
    ogImageHeight: 1062,
    ogImageAlt: 'SOUP PACK',
    twitterCard: 'summary_large_image',
})

useSchemaOrg([
    defineOrganization({
        name: 'SOUP PACK',
        logo: '/og.jpg',
        sameAs: [],
    }),
    defineWebSite({
        name: 'SOUP PACK — готовые супы с доставкой в Ташкенте',
        inLanguage: 'ru-RU',
    }),
    defineWebPage(),
])
</script>

<template>
    <NuxtLayout>
        <NuxtPage />
    </NuxtLayout>
</template>
