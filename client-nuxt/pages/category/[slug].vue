<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import ProductCard from '@/components/ProductCard.vue'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()
const catalog = useCatalog()

const slug = computed(() => String(route.params.slug))
const category = computed(() => catalog.categories.find(c => c.slug === slug.value))
const items = computed(() => catalog.products.filter(p => p.category?.slug === slug.value))
</script>

<template>
    <section class="flex-1 flex flex-col">
        <header class="sticky top-0 z-20 bg-bg px-4 pt-3 pb-3 flex items-center gap-3">
            <button type="button" aria-label="Назад" @click="router.back()"
                    class="size-11 rounded-full bg-sf border border-ln2 flex items-center justify-center text-ink">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
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
