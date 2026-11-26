<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCatalog } from '@/stores/catalog'
import { useCart } from '@/stores/cart'
import { api, productImg } from '@/services/api'
import Icon from '@/components/Icon.vue'
import SoupPuck from '@/components/SoupPuck.vue'
import CountdownBadge from '@/components/CountdownBadge.vue'
import type { OrderSet, Product } from '@/types'
import {
    type PublicDiscount, TINT_BG, fmt, benefitParts, matchProducts, matchSets,
    scopeChip, scopeLine, conditionList, endsSoon, weight,
} from '@/utils/discounts'

const catalog = useCatalog()
const cart = useCart()
const goBack = useGoBack('/')

await useAsyncData('catalog', async () => { await catalog.fetchAll(); return true })

useSeoMeta({
    title: 'Скидки и акции — SOUP PACK',
    description: 'Актуальные скидки и акции SOUP PACK на супы, пасты и наборы блюд с доставкой по Ташкенту.',
})

const discounts = ref<PublicDiscount[]>([])
await useAsyncData('public-discounts', async () => {
    try {
        const r = await api.get('/discounts/public')
        discounts.value = (r.data?.data ?? []) as PublicDiscount[]
        return true
    } catch { return false }
})

/** Обогащённая скидка: что задевает + чем её проиллюстрировать. */
interface Card {
    d: PublicDiscount
    benefit: { main: string; unit: string }
    products: Product[]
    sets: OrderSet[]
    cover: Product | null
    tintBg: string
    chip: string
    line: string
    soon: boolean
}

const cards = computed<Card[]>(() =>
    [...discounts.value]
        .sort((a, b) => weight(b) - weight(a))
        .map((d) => {
            const products = matchProducts(d, catalog.products as Product[])
            const sets = matchSets(d, catalog.sets as OrderSet[])
            const cover = products[0] || sets[0]?.items?.[0]?.product || null
            return {
                d,
                benefit: benefitParts(d),
                products,
                sets,
                cover,
                tintBg: TINT_BG[cover?.tint ?? 'tom'] || 'bg-tint-tom',
                chip: scopeChip(d, products, sets),
                line: scopeLine(d, products),
                soon: endsSoon(d),
            }
        }),
)

/** Самая выгодная — в герой. Остальные — по секциям. */
const hero = computed(() => cards.value[0] || null)
const heroProduct = computed(() => {
    const h = hero.value
    return h && h.d.level === 'line' && h.products.length === 1 ? h.products[0] : null
})
const rest = computed(() => cards.value.slice(1))

type Filter = 'all' | 'line' | 'set' | 'order'
const filter = ref<Filter>('all')
const chips = computed(() => {
    const has = (l: Filter) => rest.value.some((c) => c.d.level === l)
    const list: Array<{ id: Filter; label: string }> = [{ id: 'all', label: 'Все' }]
    if (has('line')) list.push({ id: 'line', label: 'На блюда' })
    if (has('set')) list.push({ id: 'set', label: 'Наборы' })
    if (has('order')) list.push({ id: 'order', label: 'На заказ' })
    return list
})
const visible = (l: Filter) => filter.value === 'all' || filter.value === l
const byLevel = (l: PublicDiscount['level']) => rest.value.filter((c) => c.d.level === l)
const lineCards = computed(() => byLevel('line'))
const setCards = computed(() => byLevel('set'))
const orderCards = computed(() => byLevel('order'))

/** Экономия на наборе — из серверного pricing набора, если он есть. */
function setSaving(c: Card): number {
    const s = c.sets[0] as any
    const p = s?.pricing
    if (!p) return 0
    const base = Number(p.itemsTotal ?? p.basePrice ?? 0)
    const fin = Number(p.finalPrice ?? 0)
    return base > fin ? base - fin : 0
}

/** Прогресс до порога скидки на заказ. Берём подсказку сервера (NEXT_TIER), иначе считаем сами. */
function orderProgress(d: PublicDiscount) {
    const min = Number(d.conditions?.minSubtotal || 0)
    if (!min) return null
    const subtotal = cart.subtotal || 0
    const hint = cart.hints.find((h) => h.discountId === d.id)
    const missing = hint ? hint.missing : Math.max(0, min - subtotal)
    return {
        min,
        subtotal,
        missing,
        done: missing <= 0,
        pct: Math.min(100, Math.round((subtotal / min) * 100)),
    }
}

function addHero() {
    if (heroProduct.value) cart.addProduct(heroProduct.value, 1)
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
            <h1 class="m-0 flex-1 font-display font-black text-[24px] leading-none">Скидки</h1>
            <span v-if="cards.length"
                  class="h-8 px-3 rounded-full bg-btr text-[#2A1209] flex items-center font-extrabold text-[13px]">
                {{ cards.length }} {{ cards.length === 1 ? 'акция' : cards.length < 5 ? 'акции' : 'акций' }}
            </span>
        </header>

        <!-- Empty -->
        <section v-if="!hero" class="px-4 pt-6">
            <div class="bg-sf rounded-[28px] px-6 py-10 flex flex-col items-center text-center gap-4">
                <SoupPuck variant="default" :size="96" />
                <div class="font-display font-black text-[20px]">Сейчас акций нет</div>
                <p class="m-0 text-[14px] text-fnt leading-relaxed">
                    Скидки появляются регулярно. Загляните позже, а пока посмотрите меню.
                </p>
                <NuxtLink to="/" class="h-12 px-6 rounded-2xl bg-acc text-white font-extrabold text-[15px] inline-flex items-center no-underline">
                    В меню
                </NuxtLink>
            </div>
        </section>

        <template v-else>
            <!-- Hero: самое выгодное предложение -->
            <section class="px-4 pt-1">
                <div class="relative overflow-hidden bg-acc text-white rounded-[28px] p-5 shadow-[0_18px_36px_-16px_rgba(214,58,28,0.7)]">
                    <div class="absolute -right-14 -top-8 pointer-events-none">
                        <img v-if="hero.cover && productImg(hero.cover)" :src="productImg(hero.cover)" :alt="''"
                             class="size-[200px] rounded-full object-cover shadow-[0_0_0_8px_rgba(255,255,255,0.25)]" />
                        <SoupPuck v-else :variant="hero.cover?.variant ?? 'default'" :size="200" />
                    </div>
                    <span class="absolute right-[124px] top-6 size-2.5 rounded-full bg-btr"></span>
                    <span class="absolute right-5 top-[184px] size-4 rounded-full bg-white/25"></span>

                    <NuxtLink :to="`/discounts/${hero.d.id}`" class="relative flex flex-col gap-1.5 max-w-[220px] text-white no-underline">
                        <span class="self-start inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-deep text-btr font-extrabold text-[11px] tracking-wider uppercase">
                            <Icon name="sparkles" :size="13" :stroke="2.4" />
                            Лучшее предложение
                        </span>
                        <div class="font-display font-black leading-[0.9] text-btr mt-2"
                             :class="hero.benefit.unit === '%' ? 'text-[88px]' : 'text-[46px]'">
                            {{ hero.benefit.main }}<span :class="hero.benefit.unit === '%' ? 'text-[46px]' : 'text-[22px] ml-1'">{{ hero.benefit.unit }}</span>
                        </div>
                        <div class="font-display font-extrabold text-[22px] leading-[1.1] mt-1">{{ hero.d.name }}</div>
                        <div v-if="heroProduct?.pricing" class="flex items-baseline gap-2">
                            <span class="font-extrabold text-[18px]">{{ fmt(heroProduct.pricing.finalPrice) }}</span>
                            <span class="text-[14px] opacity-80 line-through">{{ fmt(heroProduct.pricing.basePrice) }}</span>
                        </div>
                        <div v-else-if="hero.line" class="text-[13px] opacity-90 leading-snug">{{ hero.line }}</div>
                    </NuxtLink>

                    <div v-if="hero.d.endsAt" class="relative mt-4">
                        <CountdownBadge :ends-at="hero.d.endsAt" variant="full" />
                    </div>

                    <button v-if="heroProduct" type="button" @click="addHero"
                            class="relative mt-3 w-full h-[52px] rounded-[18px] bg-btr text-[#2A1209] font-extrabold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition">
                        <Icon name="plus" :size="18" :stroke="2.6" />
                        В корзину
                    </button>
                    <NuxtLink v-else :to="`/discounts/${hero.d.id}`"
                              class="relative mt-3 w-full h-[52px] rounded-[18px] bg-btr text-[#2A1209] font-extrabold text-[15px] flex items-center justify-center gap-2 no-underline active:scale-[0.98] transition">
                        Смотреть, что входит
                        <Icon name="chevron-right" :size="18" :stroke="2.6" />
                    </NuxtLink>
                </div>
            </section>

            <!-- Фильтры -->
            <nav v-if="chips.length > 2" aria-label="Тип скидки" class="pt-5 pb-1 overflow-x-auto no-scrollbar">
                <div class="flex gap-2 px-4 w-max">
                    <button v-for="c in chips" :key="c.id" type="button" @click="filter = c.id"
                            class="h-10 px-4 rounded-full font-bold text-[14px] whitespace-nowrap border-[1.5px] transition"
                            :class="filter === c.id ? 'bg-deep border-deep text-btr' : 'bg-sf border-ln2 text-ink'">
                        {{ c.label }}
                    </button>
                </div>
            </nav>

            <!-- На блюда: купоны -->
            <section v-if="lineCards.length && visible('line')" class="px-4 pt-4 flex flex-col gap-3">
                <div class="flex items-baseline justify-between">
                    <h2 class="m-0 font-display font-black text-[20px]">На блюда</h2>
                    <span class="text-[13px] font-bold text-fnt">цена уже в меню</span>
                </div>

                <NuxtLink v-for="c in lineCards" :key="c.d.id" :to="`/discounts/${c.d.id}`"
                          class="relative flex bg-sf rounded-[22px] text-ink no-underline active:scale-[0.99] transition"
                          :class="c.soon ? 'ring-2 ring-acc' : 'shadow-[0_1px_0_var(--color-ln)]'">
                    <!-- корешок -->
                    <div class="w-[108px] shrink-0 rounded-l-[22px] flex flex-col items-center justify-center gap-2 py-3.5" :class="c.tintBg">
                        <img v-if="c.cover && productImg(c.cover)" :src="productImg(c.cover)" :alt="''"
                             class="size-[58px] rounded-full object-cover shadow-[0_0_0_3px_var(--color-ring)]" />
                        <SoupPuck v-else :variant="c.cover?.variant ?? 'default'" :size="58" />
                        <span class="font-display font-black text-acct leading-none text-center px-1"
                              :class="c.benefit.unit === '%' ? 'text-[24px]' : 'text-[15px]'">
                            {{ c.benefit.main }}<template v-if="c.benefit.unit === '%'">%</template><template v-else><br>{{ c.benefit.unit }}</template>
                        </span>
                    </div>
                    <!-- перфорация -->
                    <div class="border-l-2 border-dashed border-ln my-3.5"></div>
                    <span class="absolute left-[99px] -top-[9px] size-[18px] rounded-full bg-bg"></span>
                    <span class="absolute left-[99px] -bottom-[9px] size-[18px] rounded-full bg-bg"></span>

                    <div class="flex-1 min-w-0 py-3.5 pl-4 pr-3.5 flex flex-col gap-2">
                        <div class="font-extrabold text-[16px] leading-tight line-clamp-2">{{ c.d.name }}</div>
                        <div v-if="c.line" class="text-[13px] text-fnt leading-snug line-clamp-2">{{ c.line }}</div>
                        <div class="flex flex-wrap gap-1.5">
                            <CountdownBadge v-if="c.d.endsAt" :ends-at="c.d.endsAt" variant="compact" />
                            <span class="h-[26px] px-2.5 rounded-full bg-bg text-[11px] font-extrabold flex items-center">{{ c.chip }}</span>
                            <span v-for="cond in conditionList(c.d).slice(0, 1)" :key="cond.text"
                                  class="h-[26px] px-2.5 rounded-full bg-bg text-[11px] font-extrabold flex items-center">{{ cond.text.toLowerCase() }}</span>
                        </div>
                    </div>
                </NuxtLink>
            </section>

            <!-- Наборы -->
            <section v-if="setCards.length && visible('set')" class="px-4 pt-6 flex flex-col gap-3">
                <h2 class="m-0 font-display font-black text-[20px]">Наборы</h2>
                <NuxtLink v-for="c in setCards" :key="c.d.id" :to="`/discounts/${c.d.id}`"
                          class="block rounded-[26px] bg-deep text-deepink p-[18px] no-underline active:scale-[0.99] transition">
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center">
                            <template v-for="(it, idx) in (c.sets[0]?.items || []).slice(0, 3)" :key="idx">
                                <img v-if="productImg(it.product)" :src="productImg(it.product)" :alt="it.product?.name"
                                     class="size-16 object-cover rounded-full" :class="idx ? '-ml-[18px]' : ''"
                                     style="box-shadow: 0 0 0 3px var(--color-deep)" />
                                <span v-else :class="idx ? '-ml-[18px]' : ''" class="rounded-full" style="box-shadow: 0 0 0 3px var(--color-deep)">
                                    <SoupPuck :variant="it.product?.variant ?? 'default'" :size="64" :ring="false" :shadow="false" />
                                </span>
                            </template>
                        </div>
                        <span class="font-display font-black text-btr leading-none"
                              :class="c.benefit.unit === '%' ? 'text-[30px]' : 'text-[20px]'">
                            {{ c.benefit.main }}{{ c.benefit.unit === '%' ? '%' : ' ' + c.benefit.unit }}
                        </span>
                    </div>
                    <div class="font-display font-extrabold text-[19px] leading-tight mt-3.5">{{ c.d.name }}</div>
                    <div v-if="c.sets.length === 1 && c.sets[0].description" class="text-[13px] text-deepmut mt-1 leading-snug line-clamp-2">
                        {{ c.sets[0].description }}
                    </div>
                    <div v-else-if="c.sets.length > 1" class="text-[13px] text-deepmut mt-1">{{ c.chip }}</div>
                    <div class="flex items-center justify-between gap-3 mt-3.5 pt-3.5 border-t border-dashed border-deepink/25">
                        <div v-if="setSaving(c)">
                            <div class="text-[11px] font-extrabold uppercase tracking-wider text-deepmut">экономия</div>
                            <div class="font-display font-black text-[18px] text-btr mt-0.5">{{ fmt(setSaving(c)) }}</div>
                        </div>
                        <CountdownBadge v-else-if="c.d.endsAt" :ends-at="c.d.endsAt" variant="compact" />
                        <span v-else></span>
                        <span class="h-11 px-4 rounded-[14px] bg-btr text-[#2A1209] font-extrabold text-[14px] flex items-center shrink-0">
                            {{ c.sets.length === 1 ? 'Смотреть набор' : 'Смотреть наборы' }}
                        </span>
                    </div>
                </NuxtLink>
            </section>

            <!-- На весь заказ -->
            <section v-if="orderCards.length && visible('order')" class="px-4 pt-6 flex flex-col gap-3">
                <h2 class="m-0 font-display font-black text-[20px]">На весь заказ</h2>
                <template v-for="c in orderCards" :key="c.d.id">
                    <!-- С порогом суммы — жёлтая карточка с прогрессом -->
                    <NuxtLink v-if="orderProgress(c.d)" :to="`/discounts/${c.d.id}`"
                              class="relative overflow-hidden block rounded-[26px] bg-btr text-[#2A1209] p-[18px] no-underline">
                        <span class="absolute -right-8 -top-8 size-[120px] rounded-full border-[16px] border-acc/15"></span>
                        <div class="relative flex items-start gap-3.5">
                            <span class="font-display font-black text-[#B8300C] leading-none whitespace-nowrap"
                                  :class="c.benefit.unit === '%' ? 'text-[30px]' : 'text-[24px]'">
                                {{ c.benefit.main }}{{ c.benefit.unit === '%' ? '%' : '' }}
                            </span>
                            <div class="flex-1 min-w-0">
                                <div class="font-extrabold text-[16px] leading-tight">{{ c.d.name }}</div>
                                <div class="text-[13px] text-[#6B4A33] mt-0.5">
                                    При заказе от {{ fmt(orderProgress(c.d)!.min) }}
                                </div>
                            </div>
                        </div>
                        <div class="relative mt-4 h-3 rounded-full bg-[#2A1209]/12 overflow-hidden">
                            <div class="h-full rounded-full bg-acc transition-[width] duration-500"
                                 :style="{ width: orderProgress(c.d)!.pct + '%' }"></div>
                        </div>
                        <div class="relative flex justify-between gap-2 mt-2 text-[13px] font-bold">
                            <template v-if="orderProgress(c.d)!.done">
                                <span class="flex items-center gap-1.5"><Icon name="check" :size="16" :stroke="2.6" /> Скидка уже в корзине</span>
                            </template>
                            <template v-else-if="orderProgress(c.d)!.subtotal > 0">
                                <span>В корзине {{ fmt(orderProgress(c.d)!.subtotal) }}</span>
                                <span class="text-[#B8300C] font-extrabold">ещё {{ fmt(orderProgress(c.d)!.missing) }}</span>
                            </template>
                            <template v-else>
                                <span>Сработает автоматически в корзине</span>
                            </template>
                        </div>
                    </NuxtLink>

                    <!-- Без порога -->
                    <NuxtLink v-else :to="`/discounts/${c.d.id}`"
                              class="bg-sf rounded-[22px] p-4 flex items-center gap-3.5 text-ink no-underline shadow-[0_1px_0_var(--color-ln)]">
                        <span class="size-[52px] rounded-2xl bg-ok-bg text-oks flex items-center justify-center shrink-0">
                            <Icon :name="conditionList(c.d)[0]?.icon || 'receipt'" :size="24" :stroke="2.2" />
                        </span>
                        <div class="flex-1 min-w-0">
                            <div class="font-extrabold text-[16px] leading-tight">{{ c.d.name }}</div>
                            <div class="text-[13px] text-fnt mt-0.5 leading-snug">
                                {{ conditionList(c.d)[0]?.text || 'На любой заказ' }}
                            </div>
                        </div>
                        <span class="font-display font-black text-oks leading-none whitespace-nowrap"
                              :class="c.benefit.unit === '%' ? 'text-[20px]' : 'text-[15px]'">
                            {{ c.benefit.main }}{{ c.benefit.unit === '%' ? '%' : '' }}
                        </span>
                    </NuxtLink>
                </template>
            </section>

            <!-- Как работают скидки -->
            <section class="px-4 pt-7">
                <div class="border-[1.5px] border-dashed border-ln2 rounded-[24px] p-[18px] flex flex-col gap-3.5">
                    <div class="font-display font-extrabold text-[16px]">Как работают скидки</div>
                    <div v-for="(s, i) in [
                        'Промокод не нужен: скидка применяется сама',
                        'Цены со скидкой уже видны в меню',
                        'Итоговую сумму со всеми скидками видно в корзине',
                    ]" :key="i" class="flex gap-3 items-start">
                        <span class="size-7 rounded-full bg-deep text-btr font-display font-black text-[13px] flex items-center justify-center shrink-0">{{ i + 1 }}</span>
                        <span class="text-[14px] leading-snug pt-1">{{ s }}</span>
                    </div>
                </div>
            </section>
        </template>

        <div class="flex-1 min-h-4"></div>
    </section>
</template>
