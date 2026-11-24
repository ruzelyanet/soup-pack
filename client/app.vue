<script setup lang="ts">
const route = useRoute()
const siteUrl = (useRuntimeConfig().public.siteUrl as string).replace(/\/$/, '')

useHead({
    link: [{ rel: 'canonical', href: () => siteUrl + route.path }],
    meta: [{ property: 'og:url', content: () => siteUrl + route.path }],
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
        potentialAction: {
            '@type': 'SearchAction',
            target: `${siteUrl}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
        },
    }),
    defineWebPage(),
])
</script>

<template>
    <NuxtLayout>
        <NuxtPage />
    </NuxtLayout>
</template>
