<script setup lang="ts">
import { OG_LOGO, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, seoSiteUrl } from '@/utils/seo'

const route = useRoute()

const siteUrl = seoSiteUrl()

useHead({
    link: [{ rel: 'canonical', href: () => siteUrl + route.path }],
    meta: [{ property: 'og:url', content: () => siteUrl + route.path }],
})

/** Значения по умолчанию — как на главной: логотип, заголовок и описание сайта.
 *  Страницы со своим превью (товар, шеф, «О нас») перекрывают их своим useSeoMeta. */
useSeoMeta({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    ogSiteName: SITE_NAME,
    ogLocale: 'ru_RU',
    ogType: 'website',
    ogTitle: SITE_TITLE,
    ogDescription: SITE_DESCRIPTION,
    ogImage: siteUrl + OG_LOGO,
    ogImageAlt: 'Логотип SOUP PACK',
    twitterCard: 'summary_large_image',
})

useSchemaOrg([
    defineOrganization({
        name: 'SOUP PACK',
        logo: OG_LOGO,
        sameAs: [],
    }),
    defineWebSite({
        name: SITE_TITLE,
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
