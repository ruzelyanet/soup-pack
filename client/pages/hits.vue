<script setup lang="ts">
import { computed } from 'vue'
import { useCatalog } from '@/stores/catalog'
import ProductCard from '@/components/ProductCard.vue'
import Icon from '@/components/Icon.vue'

const catalog = useCatalog()

await useAsyncData('catalog', async () => { await catalog.fetchAll(); return true })

const items = computed(() =>
    catalog.products.filter((p) => (p.tags || []).includes('хит')),
)

useSeoMeta({
    title: 'Хиты — SOUP PACK',
    description: 'Самые популярные супы SOUP PACK: лучшие продажи месяца, порции 350 г, доставка по Ташкенту.',
})

useSchemaOrg([
    defineBreadcrumb({
        itemListElement: [
            { name: 'Главная', item: '/' },
            { name: 'Хиты', item: '/hits' },
        ],
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
            <h1 class="m-0 font-display font-black text-[22px] leading-none flex items-center gap-2">
                <span class="text-acc">🔥</span>Хиты
            </h1>
        </header>

        <div v-if="items.length" class="px-4 pt-2 pb-6 grid grid-cols-2 gap-3">
            <ProductCard v-for="p in items" :key="p.id" :product="p" />
        </div>
        <div v-else class="flex-1 flex items-center justify-center text-fnt text-sm px-6 text-center">
            Пока нет товаров с тегом «хит». Отметь их в админке — Товар → Теги.
        </div>
    </section>
</template>
