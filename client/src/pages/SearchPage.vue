<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import { productImg } from '@/services/api'

function pricingOf(p: any) { return p?.pricing }
function hasDiscount(p: any) { return Boolean(pricingOf(p)?.discountPercent) }
function finalPrice(p: any) { return pricingOf(p)?.finalPrice ?? p?.price ?? 0 }
function basePriceOf(p: any) { return pricingOf(p)?.basePrice ?? p?.price ?? 0 }

const router = useRouter()
const catalog = useCatalog()
const q = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const results = computed(() => {
    const needle = q.value.trim().toLowerCase()
    if (!needle) return catalog.products.slice(0, 6)
    return catalog.products.filter((p) => {
        const compText = Array.isArray(p.composition) ? p.composition.join(' ') : (p.composition || '')
        return p.name.toLowerCase().includes(needle)
            || compText.toLowerCase().includes(needle)
            || (p.subtitle?.toLowerCase().includes(needle) ?? false)
    })
})

onMounted(() => nextTick(() => inputRef.value?.focus()))

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

const SUGGEST = ['Том-ям', 'Крем-суп', 'Куриный', 'Набор', 'Острое']
</script>

<template>
    <section class="flex-1 flex flex-col">
        <header class="px-4 pt-3.5 pb-3 flex items-center gap-2">
            <button type="button" aria-label="Назад" @click="router.back()"
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <div class="flex-1 h-11 rounded-2xl bg-sf border border-ln px-3.5 flex items-center gap-2.5">
                <Icon name="search" :size="18" class="text-fnt" />
                <input ref="inputRef" v-model="q" placeholder="Том-ям, крем-суп, набор…"
                       class="flex-1 min-w-0 border-0 outline-none bg-transparent font-semibold text-[15px] text-ink" />
                <button v-if="q" type="button" aria-label="Очистить" @click="q = ''"
                        class="text-fnt">
                    <Icon name="close" :size="18" />
                </button>
            </div>
        </header>

        <section v-if="!q" class="px-4 pt-1 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
            <button v-for="s in SUGGEST" :key="s" type="button" @click="q = s"
                    class="h-10 px-4 rounded-full bg-sf border border-ln2 text-ink font-bold text-[13px] whitespace-nowrap">
                {{ s }}
            </button>
        </section>

        <section class="px-4 pt-2 flex flex-col gap-2.5">
            <RouterLink v-for="p in results" :key="p.id" :to="`/product/${p.slug}`"
                        class="bg-sf rounded-[22px] p-3 flex gap-3 items-center text-ink">
                <img v-if="productImg(p)" :src="productImg(p)" :alt="p.name"
                     class="size-[56px] object-cover rounded-full shrink-0" />
                <SoupPuck v-else :variant="p.variant ?? 'default'" :size="56"
                          :ring="false" :shadow="false" />
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                        <div class="font-extrabold text-[15px] truncate">{{ p.name }}</div>
                        <span v-if="hasDiscount(p)"
                              class="bg-acc text-white font-extrabold text-[10px] px-1.5 py-0.5 rounded-full shrink-0">
                            −{{ pricingOf(p).discountPercent }}%
                        </span>
                    </div>
                    <div class="text-[12px] text-fnt truncate">{{ p.subtitle }}</div>
                </div>
                <div class="flex flex-col items-end shrink-0">
                    <span v-if="hasDiscount(p)" class="text-[11px] text-fnt line-through leading-none">
                        {{ fmt(basePriceOf(p)) }}
                    </span>
                    <span class="font-extrabold text-acct text-[14px] leading-tight">
                        {{ fmt(finalPrice(p)) }}
                    </span>
                </div>
            </RouterLink>
            <div v-if="!results.length" class="text-center text-fnt pt-10">
                Ничего не нашли по «{{ q }}»
            </div>
        </section>
    </section>
</template>
