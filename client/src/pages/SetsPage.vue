<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import { productImg } from '@/services/api'

const router = useRouter()
const catalog = useCatalog()

const sets = computed(() => catalog.sets.filter((s) => s.showInCatalog))

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
</script>

<template>
    <section class="flex-1 flex flex-col">
        <header class="sticky top-0 z-20 bg-bg px-4 pt-3 pb-3 flex items-center gap-3">
            <button type="button" aria-label="Назад" @click="router.back()"
                    class="size-11 rounded-full bg-sf border border-ln2 flex items-center justify-center text-ink">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <h1 class="m-0 font-display font-black text-[22px] leading-none">Наборы</h1>
        </header>

        <div v-if="sets.length" class="px-4 pt-2 pb-6 flex flex-col gap-3">
            <RouterLink v-for="s in sets" :key="s.id" :to="`/set/${s.slug}`"
                        class="rounded-[26px] bg-deep text-deepink p-[18px] flex flex-col gap-3 no-underline shadow-sm active:scale-[0.99] transition">
                <div class="flex items-center">
                    <template v-for="(it, idx) in s.items.slice(0, 3)" :key="idx">
                        <img v-if="productImg(it.product)" :src="productImg(it.product)" :alt="it.product?.name"
                             class="size-16 object-cover rounded-full"
                             :class="idx === 0 ? '' : '-ml-4.5'"
                             style="box-shadow: 0 0 0 3px var(--color-deep)" />
                        <SoupPuck v-else
                                  :variant="it.product?.variant ?? 'default'"
                                  :size="64" :ring="false" :shadow="false"
                                  :class="idx === 0 ? '' : '-ml-4.5'"
                                  style="box-shadow: 0 0 0 3px var(--color-deep)" />
                    </template>
                    <span v-if="s.items.length > 3"
                          class="size-16 -ml-4.5 rounded-full flex items-center justify-center bg-[#F7E0B5] text-ink font-extrabold text-[14px]"
                          style="box-shadow: 0 0 0 3px var(--color-deep)">
                        +{{ s.items.length - 3 }}
                    </span>
                </div>
                <span class="font-display font-extrabold text-[20px] leading-tight">{{ s.name }}</span>
                <span v-if="s.description" class="text-[13px] text-deepmut leading-snug">{{ s.description }}</span>
                <div class="mt-1 flex items-end justify-between gap-2">
                    <div class="flex flex-col">
                        <span v-if="(s as any).pricing?.discountPercent"
                              class="text-[12px] text-deepmut line-through">
                            {{ fmt(Number((s as any).pricing.basePrice)) }}
                        </span>
                        <span class="font-display font-extrabold text-[24px] leading-none text-btr">
                            {{ fmt(Number((s as any).pricing?.finalPrice ?? 0)) }}
                        </span>
                    </div>
                    <span class="size-11 rounded-full bg-btr text-ink flex items-center justify-center">
                        <Icon name="chevron-right" :size="20" :stroke="2.6" />
                    </span>
                </div>
            </RouterLink>
        </div>
        <div v-else class="flex-1 flex items-center justify-center text-fnt text-sm px-6 text-center">
            Наборов пока нет — загляните позже.
        </div>
    </section>
</template>
