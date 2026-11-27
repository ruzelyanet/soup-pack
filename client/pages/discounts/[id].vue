<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalog } from '@/stores/catalog'
import { api, productImg } from '@/services/api'
import ProductCard from '@/components/ProductCard.vue'
import Icon from '@/components/Icon.vue'
import SoupPuck from '@/components/SoupPuck.vue'
import CountdownBadge from '@/components/CountdownBadge.vue'
import type { OrderSet, Product } from '@/types'
import {
    type PublicDiscount, TINT_BG, benefitParts, benefitText, fmtDate,
    matchProducts, matchSets, matchCategories, conditionList, weight,
} from '@/utils/discounts'

const route = useRoute()
const catalog = useCatalog()
const goBack = useGoBack('/discounts')
const share = useShare()

await useAsyncData('catalog', async () => { await catalog.fetchAll(); return true })

const all = ref<PublicDiscount[]>([])
const { pending } = await useAsyncData(`public-discount-${route.params.id}`, async () => {
    try {
        const r = await api.get('/discounts/public')
        all.value = (r.data?.data ?? []) as PublicDiscount[]
        return true
    } catch {
        return false
    }
})

const discount = computed(() => all.value.find((d) => d.id === Number(route.params.id)) ?? null)

useSeoMeta({
    title: () => discount.value ? `${discount.value.publicLabel || discount.value.name} — SOUP PACK` : 'Скидка — SOUP PACK',
    description: () => discount.value ? `Скидка ${benefitText(discount.value)}: ${discount.value.publicLabel || discount.value.name}` : '',
})

const benefit = computed(() => discount.value ? benefitParts(discount.value) : null)
const matchedProducts = computed(() => discount.value ? matchProducts(discount.value, catalog.products as Product[]) : [])
const matchedSets = computed(() => discount.value ? matchSets(discount.value, catalog.sets as OrderSet[]) : [])
const matchedCategories = computed(() => discount.value ? matchCategories(discount.value) : [])

/** Чем иллюстрировать купон: первые блюда из охвата. */
const covers = computed<Product[]>(() => {
    const list = matchedProducts.value.length
        ? matchedProducts.value
        : (matchedSets.value[0]?.items || []).map((i) => i.product)
    return list.filter(Boolean).slice(0, 2)
})
const tintBg = computed(() => TINT_BG[covers.value[0]?.tint ?? 'chi'] || 'bg-tint-chi')

const levelTag = computed(() => {
    const d = discount.value
    if (!d) return ''
    if (d.level === 'order') return 'На весь заказ'
    if (d.level === 'set') return 'На наборы'
    const t = (d.targets || []).filter((x) => !x.exclude)
    if (t.some((x) => x.targetType === 'all-products')) return 'На всё меню'
    if (t.some((x) => x.targetType === 'category')) return 'Категория'
    return 'На блюда'
})

/** Плитки условий: реальные условия из админки + «без промокода» всегда. */
const conditions = computed(() => {
    const d = discount.value
    if (!d) return []
    return [{ icon: 'check', text: 'Без промокода' }, ...conditionList(d)]
})

const others = computed(() =>
    all.value
        .filter((d) => d.id !== discount.value?.id)
        .sort((a, b) => weight(b) - weight(a))
        .slice(0, 2),
)

function onShare() {
    const d = discount.value
    if (!d) return
    share({ title: `${benefitText(d)} — ${d.name}`, text: d.publicLabel || d.name })
}
</script>

<template>
    <section class="flex-1 flex flex-col pb-6">
        <!-- Header -->
        <header class="sticky top-0 z-20 bg-bg px-4 pt-3 pb-3 flex items-center gap-3">
            <button type="button" aria-label="Назад" @click="goBack"
                    class="size-11 rounded-full bg-sf border border-ln2 flex items-center justify-center text-ink">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <span class="flex-1"></span>
            <button v-if="discount" type="button" aria-label="Поделиться" @click="onShare"
                    class="size-11 rounded-full bg-sf border border-ln2 flex items-center justify-center text-ink">
                <Icon name="share" :size="19" :stroke="2.2" />
            </button>
        </header>

        <div v-if="pending" class="flex-1 flex items-center justify-center text-fnt">Загрузка…</div>

        <div v-else-if="!discount" class="flex-1 flex flex-col items-center justify-center text-fnt px-6 text-center gap-4">
            <SoupPuck variant="default" :size="88" />
            <div class="font-display font-black text-[20px] text-ink">Акция закончилась</div>
            <p class="m-0 text-[14px] leading-relaxed">Её уже нет в списке, но есть другие скидки.</p>
            <NuxtLink to="/discounts" class="h-12 px-6 rounded-2xl bg-acc text-white font-extrabold text-[15px] inline-flex items-center no-underline">
                Все скидки
            </NuxtLink>
        </div>

        <template v-else-if="benefit">
            <!-- Купон -->
            <section class="px-4 pt-1">
                <div class="relative overflow-hidden px-5 pt-[22px] pb-6 rounded-t-[30px]" :class="[tintBg, discount.endsAt ? '' : 'rounded-b-[30px]']">
                    <div class="absolute -right-10 -top-6 pointer-events-none">
                        <img v-if="covers[0] && productImg(covers[0])" :src="productImg(covers[0])" :alt="''"
                             class="size-[190px] rounded-full object-cover shadow-[0_0_0_6px_var(--color-ring)]" />
                        <SoupPuck v-else :variant="covers[0]?.variant ?? 'pumpkin-cream'" :size="190" />
                    </div>
                    <div v-if="covers[1]" class="absolute right-[118px] top-[124px] pointer-events-none">
                        <img v-if="productImg(covers[1])" :src="productImg(covers[1])" :alt="''"
                             class="size-[74px] rounded-full object-cover shadow-[0_0_0_4px_var(--color-ring)]" />
                        <SoupPuck v-else :variant="covers[1].variant ?? 'default'" :size="74" />
                    </div>

                    <div class="relative max-w-[200px]">
                        <span class="inline-flex h-7 px-2.5 rounded-full bg-deep text-btr font-extrabold text-[11px] tracking-wider uppercase items-center">
                            {{ levelTag }}
                        </span>
                        <div class="font-display font-black leading-[0.9] text-acc mt-3.5"
                             :class="benefit.unit === '%' ? 'text-[92px]' : 'text-[44px]'">
                            {{ benefit.main }}<span :class="benefit.unit === '%' ? 'text-[46px]' : 'text-[22px] ml-1'">{{ benefit.unit }}</span>
                        </div>
                    </div>
                    <h1 class="relative m-0 font-display font-black text-[26px] leading-[1.08] text-ink" :class="covers[1] ? 'mt-12' : 'mt-8'">
                        {{ discount.name }}
                    </h1>
                    <div v-if="discount.publicLabel && discount.publicLabel !== discount.name"
                         class="relative text-[14px] font-bold text-mut mt-1.5">
                        {{ discount.publicLabel }}
                    </div>
                    <p v-if="discount.description" class="relative m-0 mt-2 text-[14px] text-mut leading-relaxed whitespace-pre-line">
                        {{ discount.description }}
                    </p>
                </div>

                <template v-if="discount.endsAt">
                    <!-- перфорация -->
                    <div class="relative h-6 flex items-center" :class="tintBg">
                        <span class="absolute -left-3 size-6 rounded-full bg-bg"></span>
                        <span class="absolute -right-3 size-6 rounded-full bg-bg"></span>
                        <span class="flex-1 mx-5 border-t-2 border-dashed border-ink/20"></span>
                    </div>
                    <!-- корешок с таймером -->
                    <div class="bg-deep text-deepink rounded-b-[30px] px-5 pt-[18px] pb-5 -mt-px">
                        <div class="text-[11px] font-extrabold uppercase tracking-widest text-deepmut">До конца акции</div>
                        <div class="mt-2.5">
                            <CountdownBadge :ends-at="discount.endsAt" variant="full" />
                        </div>
                        <div class="text-[13px] text-deepmut mt-3">Действует до {{ fmtDate(discount.endsAt) }} включительно</div>
                    </div>
                </template>
            </section>

            <!-- Условия -->
            <section class="px-4 pt-[22px]">
                <h2 class="m-0 mb-3 font-display font-black text-[18px]">Условия</h2>
                <div class="grid grid-cols-2 gap-2.5">
                    <div v-for="c in conditions" :key="c.text" class="bg-sf rounded-[18px] p-3.5 flex flex-col gap-2">
                        <Icon :name="c.icon" :size="22" :stroke="2.2" class="text-acct" />
                        <span class="font-extrabold text-[14px] leading-snug">{{ c.text }}</span>
                    </div>
                </div>
            </section>

            <!-- Товары -->
            <section v-if="matchedProducts.length" class="px-4 pt-6 flex flex-col gap-3">
                <div class="flex items-baseline justify-between">
                    <h2 class="m-0 font-display font-black text-[18px]">Блюда со скидкой</h2>
                    <span class="text-[13px] font-bold text-fnt">{{ matchedProducts.length }}</span>
                </div>
                <div class="grid grid-cols-2 gap-2.5">
                    <ProductCard v-for="p in matchedProducts" :key="p.id" :product="p" />
                </div>
            </section>

            <!-- Наборы -->
            <section v-if="matchedSets.length" class="px-4 pt-6 flex flex-col gap-3">
                <h2 class="m-0 font-display font-black text-[18px]">Наборы со скидкой</h2>
                <NuxtLink v-for="s in matchedSets" :key="s.id" :to="`/set/${s.slug}`"
                          class="rounded-[22px] bg-deep text-deepink p-4 flex items-center gap-4 no-underline">
                    <div class="flex items-center">
                        <template v-for="(it, idx) in (s.items || []).slice(0, 3)" :key="idx">
                            <img v-if="productImg(it.product)" :src="productImg(it.product)" :alt="it.product?.name"
                                 class="bg-[#F7E0B5] size-14 object-cover rounded-full" :class="idx ? '-ml-4' : ''"
                                 style="box-shadow: 0 0 0 2.5px var(--color-deep)" />
                            <span v-else :class="idx ? '-ml-4' : ''" class="rounded-full" style="box-shadow: 0 0 0 2.5px var(--color-deep)">
                                <SoupPuck :variant="it.product?.variant ?? 'default'" :size="56" :ring="false" :shadow="false" />
                            </span>
                        </template>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-display font-extrabold text-[16px] leading-tight">{{ s.name }}</div>
                        <div v-if="s.description" class="text-[12px] text-deepmut leading-snug line-clamp-2 mt-0.5">{{ s.description }}</div>
                    </div>
                    <span class="size-9 rounded-full bg-btr text-[#2A1209] flex items-center justify-center shrink-0">
                        <Icon name="chevron-right" :size="18" :stroke="2.4" />
                    </span>
                </NuxtLink>
            </section>

            <!-- Категории (если товаров категории пока нет в каталоге) -->
            <section v-if="!matchedProducts.length && matchedCategories.length" class="px-4 pt-6 flex flex-col gap-3">
                <h2 class="m-0 font-display font-black text-[18px]">Категории</h2>
                <NuxtLink v-for="c in matchedCategories" :key="c.id" :to="`/category/${c.slug}`"
                          class="bg-sf rounded-[20px] p-4 flex items-center justify-between text-ink no-underline">
                    <span class="font-bold text-[16px]">{{ c.name }}</span>
                    <Icon name="chevron-right" :size="20" :stroke="2.4" class="text-fnt" />
                </NuxtLink>
            </section>

            <!-- Скидка на заказ без привязки к блюдам -->
            <section v-if="!matchedProducts.length && !matchedSets.length && !matchedCategories.length" class="px-4 pt-6">
                <NuxtLink to="/" class="bg-btr text-[#2A1209] rounded-[22px] p-4 flex items-center gap-3 no-underline">
                    <Icon name="sparkles" :size="24" :stroke="2.2" class="shrink-0" />
                    <span class="flex-1 font-extrabold text-[15px] leading-snug">Скидка применится к заказу автоматически. Выбирайте что угодно в меню.</span>
                    <Icon name="chevron-right" :size="20" :stroke="2.4" class="shrink-0" />
                </NuxtLink>
            </section>

            <!-- Ещё выгодно -->
            <section v-if="others.length" class="px-4 pt-6">
                <h2 class="m-0 mb-3 font-display font-black text-[18px]">Ещё выгодно</h2>
                <div class="flex gap-2.5">
                    <NuxtLink v-for="(o, i) in others" :key="o.id" :to="`/discounts/${o.id}`"
                              class="flex-1 min-w-0 rounded-[20px] p-3.5 no-underline"
                              :class="i === 0 ? 'bg-deep text-deepink' : 'bg-acc text-white'">
                        <div class="font-display font-black text-[20px] leading-none" :class="i === 0 ? 'text-btr' : ''">
                            {{ benefitText(o) }}
                        </div>
                        <div class="font-bold text-[13px] mt-1.5 leading-snug line-clamp-2">{{ o.name }}</div>
                    </NuxtLink>
                </div>
            </section>
        </template>
    </section>
</template>
