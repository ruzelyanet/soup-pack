<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import ProductCard from '@/components/ProductCard.vue'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()
const goBack = useGoBack()
const catalog = useCatalog()

await useAsyncData('catalog', async () => { await catalog.fetchAll(); return true })

const slug = computed(() => String(route.params.slug))
const category = computed(() => catalog.categories.find(c => c.slug === slug.value))
const items = computed(() => catalog.products.filter(p => p.category?.slug === slug.value))

useSeoMeta({
    title: () => category.value ? `${category.value.name} — SOUP PACK` : 'Категория — SOUP PACK',
    description: () => category.value ? `${category.value.name}: готовые блюда SOUP PACK с доставкой в Ташкенте.` : '',
})

useSchemaOrg([
    defineBreadcrumb({
        itemListElement: () => {
            const c = category.value
            const items: Array<{ name: string; item: string }> = [{ name: 'Главная', item: '/' }]
            if (c) items.push({ name: c.name, item: `/category/${c.slug}` })
            return items
        },
    }),
])
</script>

<template>
    <section class="flex-1 flex flex-col">
        <header class="sticky top-0 z-20 bg-bg px-4 pt-3 pb-3 flex items-center gap-3">
            <NuxtLink to="/" aria-label="Назад" type="button"  
                    class="size-11 rounded-full bg-sf border border-ln2 flex items-center justify-center text-ink">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </NuxtLink>
            <h1 class="m-0 font-display font-black text-[22px] leading-none">
                {{ category?.name || 'Категория' }}
            </h1>
        </header>

        <div v-if="items.length" class="px-4 pt-2 pb-6 grid grid-cols-2 gap-3">
            <ProductCard v-for="p in items" :key="p.id" :product="p" />
        </div>
        <div v-else class="flex-1 flex items-center justify-center text-fnt text-sm px-6 text-center">
            В этой категории пока нет товаров.
        </div>
    </section>
</template>
