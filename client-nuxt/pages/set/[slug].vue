<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import { useCart } from '@/stores/cart'
import SoupPuck from '@/components/SoupPuck.vue'
import { productImg } from '@/services/api'
import Icon from '@/components/Icon.vue'

const route = useRoute()
const router = useRouter()
const catalog = useCatalog()
const cart = useCart()

const set = computed(() =>
    catalog.sets.find((s) => s.slug === route.params.slug) || catalog.sets[0],
)
const qty = ref(1)

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

function addSet() {
    if (!set.value) return
    cart.addSet(set.value, qty.value)
    router.push('/cart')
}
</script>

<template>
    <section v-if="set" class="flex-1 flex flex-col">
        <div class="relative bg-deep text-deepink rounded-b-[36px] pb-8">
            <div class="absolute top-3.5 left-4 right-4 flex justify-between z-10">
                <button type="button" aria-label="Назад" @click="router.back()"
                        class="size-11 rounded-full bg-sf flex items-center justify-center text-ink">
                    <Icon name="chevron-left" :size="20" :stroke="2.4" />
                </button>
                <button type="button" aria-label="Поделиться"
                        class="size-11 rounded-full bg-sf flex items-center justify-center text-ink">
                    <Icon name="share" :size="20" />
                </button>
            </div>

            <div class="pt-12 flex items-center justify-center">
                <template v-for="(it, idx) in set.items.slice(0, 4)" :key="idx">
                    <img v-if="productImg(it.product)" :src="productImg(it.product)" :alt="it.product?.name"
                         class="size-[90px] object-cover rounded-full"
                         :style="{ marginLeft: idx === 0 ? '0' : '-26px', boxShadow: '0 0 0 4px var(--color-deep)' }" />
                    <SoupPuck v-else :variant="it.product?.variant ?? 'default'"
                              :size="90"
                              :ring="false" :shadow="false"
                              :style="{ marginLeft: idx === 0 ? '0' : '-26px', boxShadow: '0 0 0 4px var(--color-deep)' }" />
                </template>
            </div>

            <div class="px-5 pt-6 flex flex-col gap-2">
                <span class="self-start bg-btr text-ink font-extrabold text-[11px] tracking-wider uppercase px-2.5 py-1 rounded-full">
                    Набор −12%
                </span>
                <h1 class="m-0 font-display font-black text-[30px] leading-tight">{{ set.name }}</h1>
                <p class="m-0 text-deepmut text-[15px] leading-snug">{{ set.description }}</p>
                <div class="pt-2 flex items-baseline gap-2.5">
                    <span class="font-display font-black text-[26px] text-btr">
                        {{ fmt(set.pricing?.finalPrice ?? 0) }}
                    </span>
                    <span v-if="set.pricing?.discountPercent" class="text-deepmut line-through">
                        {{ fmt(set.pricing.basePrice) }}
                    </span>
                </div>
            </div>
        </div>

        <section class="px-4 pt-5 flex flex-col gap-2.5">
            <h2 class="m-0 font-display font-extrabold text-[18px]">Что внутри</h2>
            <div class="bg-sf rounded-[22px] p-[18px] flex flex-col gap-3">
                <div v-for="it in set.items" :key="it.product.id"
                     class="flex items-center gap-3">
                    <img v-if="productImg(it.product)" :src="productImg(it.product)" :alt="it.product?.name"
                         class="size-[48px] object-cover rounded-full shrink-0" />
                    <SoupPuck v-else :variant="it.product?.variant ?? 'default'" :size="48"
                              :ring="false" :shadow="false" />
                    <div class="flex-1 min-w-0">
                        <div class="font-extrabold text-[15px]">{{ it.product.name }}</div>
                        <div class="text-[12px] font-semibold text-fnt">{{ fmt(it.product.price) }} / шт</div>
                    </div>
                    <span class="font-extrabold">×{{ it.qty }}</span>
                </div>
            </div>
        </section>

        <section class="px-4 pt-4">
            <div class="bg-sf rounded-[22px] p-[18px] flex items-center justify-between">
                <span class="font-extrabold">Количество наборов</span>
                <div role="group" aria-label="Количество" class="flex items-center bg-sf2 rounded-[14px] h-11">
                    <button type="button" aria-label="Меньше" @click="qty = Math.max(1, qty - 1)"
                            class="w-10 h-11 font-extrabold text-[20px]">−</button>
                    <span class="min-w-[18px] text-center font-extrabold">{{ qty }}</span>
                    <button type="button" aria-label="Больше" @click="qty++"
                            class="w-10 h-11 font-extrabold text-[20px]">+</button>
                </div>
            </div>
        </section>

        <div class="flex-1 min-h-6"></div>

        <div class="sticky bottom-0 bg-sf rounded-t-[26px] px-4 pt-3 pb-5 shadow-[0_-10px_30px_-16px_rgba(0,0,0,0.45)]">
            <button type="button" @click="addSet"
                    class="w-full h-14 rounded-[18px] bg-acc text-white font-extrabold text-[16px]">
                В корзину · {{ fmt((set.pricing?.finalPrice ?? 0) * qty) }}
            </button>
        </div>
    </section>
</template>
