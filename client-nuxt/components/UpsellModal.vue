<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { useCart } from '@/stores/cart'
import { useCatalog } from '@/stores/catalog'
import SoupPuck from '@/components/SoupPuck.vue'
import Icon from '@/components/Icon.vue'
import { productImg } from '@/services/api'
import type { Product } from '@/types'

const props = defineProps<{
    open: boolean
    nextTier?: { minTotal: number; percent: number } | null
    cartTotal?: number
}>()
const emit = defineEmits<{
    (e: 'update:open', v: boolean): void
}>()

const cart = useCart()
const catalog = useCatalog()

type CatKey = 'soups' | 'pasta' | 'drinks' | 'hits'
const CATS: Array<{ k: CatKey; label: string }> = [
    { k: 'soups',  label: 'Супы' },
    { k: 'pasta',  label: 'Пасты' },
    { k: 'drinks', label: 'Напитки' },
    { k: 'hits',   label: 'Хиты' },
]

const activeCat = ref<CatKey>('soups')

function productsOf(k: CatKey): Product[] {
    switch (k) {
        case 'pasta':  return catalog.products.filter((p) => p.category?.slug === 'pasta')
        case 'drinks': return catalog.products.filter((p) => p.category?.slug === 'drinks')
        case 'hits':   return catalog.products.filter((p) => p.tags?.includes('хит'))
        default:       return catalog.products.filter((p) => p.category?.slug === 'soups')
    }
}

/** Готовый список непустых секций — пустые категории не рендерим. */
const sections = computed(() =>
    CATS.map((c) => ({ ...c, items: productsOf(c.k) })).filter((s) => s.items.length > 0),
)

const scrollEl = ref<HTMLElement | null>(null)
const sectionRefs = ref<Record<string, HTMLElement | null>>({})
/** Подавить scroll-handler во время программной прокрутки, пока она не доедет до цели. */
let suppressScrollSync = 0

function setSectionRef(k: CatKey) {
    return (el: Element | null) => {
        sectionRefs.value[k] = el as HTMLElement | null
    }
}

function scrollTo(k: CatKey) {
    activeCat.value = k
    const target = sectionRefs.value[k]
    const container = scrollEl.value
    if (!target || !container) return
    const offset = target.offsetTop - container.offsetTop - 8
    suppressScrollSync = Date.now() + 600
    container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
}

function onScroll() {
    if (Date.now() < suppressScrollSync) return
    const container = scrollEl.value
    if (!container) return
    const threshold = container.scrollTop + 24
    let best: CatKey = sections.value[0]?.k ?? 'soups'
    for (const s of sections.value) {
        const el = sectionRefs.value[s.k]
        if (!el) continue
        const top = el.offsetTop - container.offsetTop
        if (top <= threshold) best = s.k
    }
    if (activeCat.value !== best) activeCat.value = best
}

watch(() => props.open, async (v) => {
    if (v) {
        activeCat.value = sections.value[0]?.k ?? 'soups'
        await nextTick()
        if (scrollEl.value) scrollEl.value.scrollTop = 0
    }
})

function qtyOf(p: Product): number {
    return cart.standaloneQty(p.id)
}

function priceOf(p: Product): number {
    const pr = (p as any).pricing
    return pr?.finalPrice ?? p.price
}

function hasDiscount(p: Product): boolean {
    const pr = (p as any).pricing
    return Boolean(pr?.discountPercent)
}

function basePriceOf(p: Product): number {
    const pr = (p as any).pricing
    return pr?.basePrice ?? p.price
}

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

const remaining = computed(() => {
    if (!props.nextTier || props.cartTotal == null) return null
    return Math.max(0, props.nextTier.minTotal - props.cartTotal)
})

function close() {
    emit('update:open', false)
}
</script>

<template>
    <Dialog
        :visible="open"
        @update:visible="emit('update:open', $event)"
        modal
        :show-header="false"
        :dismissable-mask="true"
        :style="{ width: '560px', maxWidth: '95vw' }"
        :pt="{
            content: { class: 'p-0 overflow-visible' },
            root:    { class: 'rounded-3xl overflow-hidden' },
        }"
    >
        <div class="bg-sf flex flex-col max-h-[85vh]">
            <!-- Шапка -->
            <header class="px-5 pt-5 pr-14 relative">
                <h2 class="font-display font-extrabold text-[20px] text-ink leading-tight">
                    Добавить в заказ
                </h2>
                <p v-if="nextTier && remaining && remaining > 0" class="mt-1 text-[13px] text-mut">
                    Осталось <b class="text-acc">{{ fmt(remaining) }}</b>
                    до скидки <b class="text-acc">−{{ nextTier.percent }}%</b> на весь чек.
                </p>
                <p v-else class="mt-1 text-[13px] text-mut">
                    Выберите, что добавить к заказу.
                </p>
                <button type="button" aria-label="Закрыть"
                        class="absolute top-4 right-4 size-10 rounded-full bg-sf2 flex items-center justify-center text-ink hover:bg-ln"
                        @click="close">
                    <span class="pi pi-times text-[14px]"></span>
                </button>
            </header>

            <!-- Табы категорий -->
            <nav aria-label="Категории" class="px-5 pt-4 overflow-x-auto no-scrollbar shrink-0">
                <div class="flex gap-2 w-max">
                    <button v-for="c in sections" :key="c.k"
                            type="button" @click="scrollTo(c.k)"
                            class="min-h-11 px-4.5 rounded-full font-bold text-[14px] transition"
                            :class="activeCat === c.k
                                ? 'bg-ink text-bg'
                                : 'bg-sf2 border border-ln2 text-ink'">
                        {{ c.label }}
                    </button>
                </div>
            </nav>

            <!-- Список товаров: все категории — отдельными секциями. -->
            <div ref="scrollEl" @scroll.passive="onScroll"
                 class="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                <div v-if="sections.length" class="flex flex-col gap-6">
                    <section v-for="s in sections" :key="s.k"
                             :ref="setSectionRef(s.k)" :data-cat="s.k">
                        <h3 class="m-0 mb-2.5 font-display font-extrabold text-[16px] text-ink">
                            {{ s.label }}
                        </h3>
                        <ul class="flex flex-col gap-2.5 list-none m-0 p-0">
                            <li v-for="p in s.items" :key="p.id"
                                class="flex items-center gap-3 bg-sf2 rounded-2xl p-2.5">
                                <!-- Миниатюра -->
                                <div class="size-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-tint-tom">
                                    <img v-if="productImg(p)" :src="productImg(p)!" :alt="p.name"
                                         class="w-full h-full object-cover" />
                                    <SoupPuck v-else :variant="p.variant ?? 'default'" :size="52" />
                                </div>

                                <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span class="font-extrabold text-[14px] leading-tight truncate">{{ p.name }}</span>
                                    <span v-if="p.subtitle || p.weight" class="text-[12px] text-fnt leading-none">
                                        {{ p.subtitle || (p.weight ? p.weight + ' г' : '') }}
                                    </span>
                                    <div class="flex items-baseline gap-2 mt-0.5">
                                        <span v-if="hasDiscount(p)" class="text-[11px] text-fnt line-through leading-none">
                                            {{ fmt(basePriceOf(p)) }}
                                        </span>
                                        <span class="font-extrabold text-[14px] leading-none"
                                              :class="hasDiscount(p) ? 'text-acct' : 'text-ink'">
                                            {{ fmt(priceOf(p)) }}
                                        </span>
                                    </div>
                                </div>

                                <!-- Контрол количества / «+» -->
                                <div v-if="qtyOf(p) > 0"
                                     role="group" aria-label="Количество"
                                     class="flex items-center bg-acc text-white rounded-[14px] h-11 shrink-0">
                                    <button type="button" aria-label="Меньше"
                                            @click="cart.setProductQty(p.id, qtyOf(p) - 1)"
                                            class="w-[32px] h-11 text-white font-extrabold text-[18px]">−</button>
                                    <span class="min-w-[18px] text-center font-extrabold">{{ qtyOf(p) }}</span>
                                    <button type="button" aria-label="Больше"
                                            @click="cart.addProduct(p, 1)"
                                            class="w-[32px] h-11 text-white font-extrabold text-[18px]">+</button>
                                </div>
                                <button v-else type="button" aria-label="Добавить"
                                        @click="cart.addProduct(p, 1)"
                                        class="shrink-0 size-11 rounded-full bg-acc text-white flex items-center justify-center active:scale-95 transition">
                                    <Icon name="plus" :size="20" :stroke="2.6" />
                                </button>
                            </li>
                        </ul>
                    </section>
                </div>
                <div v-else class="py-10 text-center text-fnt text-[14px]">
                    Пока нечего добавить.
                </div>
            </div>

            <!-- Футер — «Готово» закрывает модалку. -->
            <footer class="px-5 py-4 border-t border-ln bg-sf shrink-0">
                <button type="button"
                        class="w-full h-[52px] rounded-2xl bg-ink text-bg font-extrabold text-[15px]"
                        @click="close">
                    Готово
                </button>
            </footer>
        </div>
    </Dialog>
</template>
