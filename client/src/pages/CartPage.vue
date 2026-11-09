<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCart, type CartItem } from '@/stores/cart'
import { useCatalog } from '@/stores/catalog'
import SoupPuck from '@/components/SoupPuck.vue'
import { productImg } from '@/services/api'
import Icon from '@/components/Icon.vue'
import UpsellPickerModal from '@/components/UpsellPickerModal.vue'

const cart = useCart()
const catalog = useCatalog()
const router = useRouter()

function productOf(id: number) { return catalog.products.find((p) => p.id === id) }
function setOf(id: number) { return catalog.sets.find((s) => s.id === id) }

/** Карточки корзины — по позиции (`cart.items[idx]`), а не по развёрнутой строке с сервера.
 *  Для набора: одна карточка = один `cart.items` с qty экземпляров; состав виден отдельным списком.
 *  Для товара: одна карточка = один товар с qty. Все цены — из серверного quote. */
const cards = computed(() => cart.items.map((it: CartItem, idx: number) => {
    if (it.type === 'product') {
        const p = productOf(it.refId)
        const lines = cart.lines.filter((l) => l.productId === it.refId && !l.orderSetId)
        const unitPrice = lines[0]?.unitPrice ?? 0
        const basePrice = lines[0]?.basePrice ?? 0
        const totalFor = lines.reduce((s, l) => s + l.lineTotal, 0)
        return {
            idx,
            kind: 'product' as const,
            name: p?.name || it.name || '…',
            img: p ? productImg(p) : it.image,
            variant: p?.variant ?? 'default',
            tint: p?.tint ?? 'tom',
            qty: it.qty,
            unitPrice,
            basePrice,
            totalFor,
            hasDiscount: basePrice > 0 && basePrice !== unitPrice,
            subtitle: p?.weight ? `${p.weight} г` : '',
        }
    }
    const s = setOf(it.refId)
    const lines = cart.lines.filter((l) => l.orderSetId === it.refId)
    const basePrice = lines.reduce((sum, l) => sum + l.basePrice * l.qty, 0) / Math.max(1, it.qty)
    const totalForInstance = lines.reduce((sum, l) => sum + l.lineTotal, 0) / Math.max(1, it.qty)
    // Процент скидки — для бейджа «−N%» на тёмной карточке.
    const discountPercent = basePrice > 0
        ? Math.round(((basePrice - totalForInstance) / basePrice) * 100)
        : 0
    return {
        idx,
        kind: 'set' as const,
        name: s?.name || it.name || 'Набор',
        img: s?.banner || it.image,
        variant: 'default' as const,
        tint: 'tom',
        qty: it.qty,
        unitPrice: totalForInstance,
        basePrice,
        totalFor: totalForInstance * it.qty,
        hasDiscount: basePrice > 0 && basePrice !== totalForInstance,
        discountPercent: discountPercent > 0 ? discountPercent : 0,
        subtitle: s?.description || 'Набор',
        // Миниатюры товаров внутри набора — для «стопки шайб» как на главной.
        setItems: (s?.items || []).slice(0, 4),
        extraCount: Math.max(0, (s?.items?.length || 0) - 4),
    }
}))

/** «Актуальные»: сперва со скидкой (большая раньше), потом хиты, потом остальное. */
const availableUpsell = computed(() => {
    const score = (p: any) => {
        const pct = p.pricing?.discountPercent || 0
        const hit = p.tags?.includes('хит') ? 1 : 0
        return pct * 10 + hit        // скидка сильнее тега
    }
    return catalog.products
        .filter((p) => !cart.items.some((i) => i.type === 'product' && i.refId === p.id))
        .slice()
        .sort((a, b) => score(b) - score(a))
})
const upsell = computed(() => availableUpsell.value.slice(0, 5))
const pickerOpen = ref(false)

function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(v) + ' сум' }
</script>

<template>
    <!-- Empty state -->
    <section v-if="!cart.items.length" class="flex-1 flex flex-col">
        <header class="px-4 pt-3.5 pb-2 flex items-center gap-3">
            <button type="button" aria-label="Назад" @click="router.push('/')"
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <h1 class="m-0 font-display font-black text-[26px]">Корзина</h1>
        </header>
        <div class="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <div aria-hidden="true" class="relative w-[180px] h-[180px]">
                <span class="absolute inset-0 rounded-full border-[3px] border-dashed border-ln2"></span>
                <span class="absolute inset-6 rounded-full bg-sf shadow-[inset_0_0_0_2px_var(--color-ln)]"></span>
                <svg viewBox="0 0 200 200" class="absolute inset-0 text-fnt" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">
                    <path d="M80 120c-10-12 10-20 0-34s8-22 2-30"/>
                    <path d="M100 120c-10-12 10-20 0-34s8-22 2-30"/>
                    <path d="M120 120c-10-12 10-20 0-34s8-22 2-30"/>
                </svg>
            </div>
            <h2 class="m-0 font-display font-black text-[24px] leading-tight">Тут пока пусто</h2>
            <p class="m-0 text-[16px] leading-snug text-mut">
                Добавьте пару шайб — горячий обед будет готов за 5 минут.
            </p>
            <RouterLink to="/"
                        class="min-h-14 px-7 rounded-[18px] bg-acc text-white font-extrabold text-[16px] flex items-center">
                Перейти в меню
            </RouterLink>
        </div>
    </section>

    <!-- Full cart -->
    <section v-else class="flex-1 flex flex-col">
        <header class="px-4 pt-3.5 pb-2 flex items-center gap-3">
            <button type="button" aria-label="Назад" @click="router.push('/')"
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <h1 class="m-0 font-display font-black text-[26px] flex-1">Корзина</h1>
            <button type="button" @click="cart.clear()"
                    class="font-bold text-[14px] text-fnt min-h-11 flex items-center">
                Очистить
            </button>
        </header>

        <!-- Lines -->
        <section class="px-4 pt-1 flex flex-col gap-2.5">
            <template v-for="c in cards" :key="c.idx">
                <!-- Карточка набора — тёмным, с бейджем «НАБОР» и стопкой шайб. -->
                <article v-if="c.kind === 'set'"
                         class="relative bg-deep text-deepink rounded-[24px] p-4 flex flex-col gap-3">
                    <span class="absolute top-3 right-3 bg-btr text-ink font-extrabold text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-full">
                        Набор
                    </span>
                    <div class="flex gap-3 items-start">
                        <!-- Стопка миниатюр первых товаров — как на главной. -->
                        <div class="shrink-0 flex items-center">
                            <template v-for="(it, i) in c.setItems" :key="i">
                                <img v-if="productImg(it.product)"
                                     :src="productImg(it.product)!" :alt="it.product?.name"
                                     class="size-14 object-cover rounded-full"
                                     :class="i === 0 ? '' : '-ml-4'"
                                     style="box-shadow: 0 0 0 3px var(--color-deep)" />
                                <SoupPuck v-else
                                          :variant="it.product?.variant ?? 'default'"
                                          :size="56" :ring="false" :shadow="false"
                                          :class="i === 0 ? '' : '-ml-4'"
                                          style="box-shadow: 0 0 0 3px var(--color-deep)" />
                            </template>
                            <span v-if="c.extraCount > 0"
                                  class="size-14 -ml-4 rounded-full flex items-center justify-center bg-[#F7E0B5] text-ink font-extrabold text-[12px]"
                                  style="box-shadow: 0 0 0 3px var(--color-deep)">
                                +{{ c.extraCount }}
                            </span>
                        </div>
                        <div class="flex-1 min-w-0 flex flex-col gap-1 pr-16">
                            <h2 class="m-0 font-display font-extrabold text-[17px] leading-tight truncate">
                                {{ c.name }}
                            </h2>
                            <span class="text-[12px] text-deepmut leading-snug line-clamp-2">
                                {{ c.subtitle }}
                            </span>
                            <span v-if="c.hasDiscount"
                                  class="self-start inline-flex items-center gap-1 bg-acc text-white text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1">
                                <span class="pi pi-tag text-[9px]"></span>
                                −{{ c.discountPercent }}%
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                        <div role="group" aria-label="Количество"
                             class="flex items-center bg-[rgba(255,241,220,0.1)] rounded-[14px] h-11">
                            <button type="button" aria-label="Меньше"
                                    class="w-10 h-11 text-deepink font-extrabold text-[20px]"
                                    @click="cart.setQtyAt(c.idx, c.qty - 1)">−</button>
                            <span class="min-w-[18px] text-center font-extrabold">{{ c.qty }}</span>
                            <button type="button" aria-label="Больше"
                                    class="w-10 h-11 text-deepink font-extrabold text-[20px]"
                                    @click="cart.setQtyAt(c.idx, c.qty + 1)">+</button>
                        </div>
                        <div class="flex flex-col items-end">
                            <span v-if="c.hasDiscount" class="text-[11px] text-deepmut line-through leading-none">
                                {{ fmt(c.basePrice * c.qty) }}
                            </span>
                            <span class="font-display font-extrabold text-[18px] text-btr leading-tight">
                                {{ fmt(c.totalFor) }}
                            </span>
                        </div>
                    </div>
                </article>

                <!-- Карточка обычного товара — как раньше. -->
                <article v-else
                         class="bg-sf rounded-[24px] p-3 flex gap-3 items-center">
                    <div class="shrink-0 size-[84px] rounded-[18px] overflow-hidden flex items-center justify-center"
                         :class="c.img ? 'bg-sf2' : `bg-tint-${c.tint}`">
                        <img v-if="c.img" :src="c.img" :alt="c.name"
                             class="w-full h-full object-cover" />
                        <SoupPuck v-else :variant="c.variant" :size="64" :ring="true" :shadow="false" />
                    </div>
                    <div class="flex-1 min-w-0 flex flex-col gap-1.5">
                        <h2 class="m-0 font-extrabold text-[15px] truncate">{{ c.name }}</h2>
                        <span class="text-[12px] font-semibold text-fnt">
                            {{ c.subtitle }} · {{ fmt(c.unitPrice) }} / шт
                        </span>
                        <span v-if="c.hasDiscount"
                              class="self-start inline-flex items-center gap-1 bg-acc/15 text-acc text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full">
                            <span class="pi pi-tag text-[9px]"></span>
                            Скидка · −{{ fmt(c.basePrice - c.unitPrice) }}
                        </span>
                        <div class="flex items-center justify-between gap-2">
                            <div role="group" aria-label="Количество"
                                 class="flex items-center bg-sf2 rounded-[14px] h-11">
                                <button type="button" aria-label="Меньше"
                                        class="w-10 h-11 text-ink font-extrabold text-[20px]"
                                        @click="cart.setQtyAt(c.idx, c.qty - 1)">−</button>
                                <span class="min-w-[18px] text-center font-extrabold">{{ c.qty }}</span>
                                <button type="button" aria-label="Больше"
                                        class="w-10 h-11 text-ink font-extrabold text-[20px]"
                                        @click="cart.setQtyAt(c.idx, c.qty + 1)">+</button>
                            </div>
                            <span class="font-extrabold text-[16px]">{{ fmt(c.totalFor) }}</span>
                        </div>
                    </div>
                </article>
            </template>
        </section>

        <!-- Upsell -->
        <section v-if="upsell.length" class="pt-4 flex flex-col gap-2.5">
            <h2 class="m-0 px-4 font-extrabold text-[16px]">Добавить к заказу?</h2>
            <div class="overflow-x-auto no-scrollbar">
                <div class="flex gap-2.5 px-4 pb-1 w-max items-stretch">
                    <div v-for="p in upsell" :key="p.id"
                         class="w-[300px] bg-sf rounded-[20px] p-2.5 flex gap-2.5 items-center">
                        <img v-if="productImg(p)" :src="productImg(p)!" :alt="p.name"
                             class="size-[52px] object-cover rounded-full shrink-0" />
                        <SoupPuck v-else :variant="p.variant ?? 'default'" :size="52"
                                  :ring="false" :shadow="false" />
                        <span class="flex-1 flex flex-col min-w-0">
                            <span class="flex items-center gap-1.5">
                                <span class="font-extrabold text-[13px] leading-tight truncate">{{ p.name }}</span>
                                <span v-if="(p as any).pricing?.discountPercent"
                                      class="bg-acc text-white font-extrabold text-[9px] px-1.5 py-0 rounded-full shrink-0">
                                    −{{ (p as any).pricing.discountPercent }}%
                                </span>
                            </span>
                            <span class="flex items-baseline gap-1.5">
                                <span v-if="(p as any).pricing?.discountPercent"
                                      class="text-[10px] text-fnt line-through">
                                    {{ fmt((p as any).pricing.basePrice) }}
                                </span>
                                <span class="font-extrabold text-[13px] text-acct">
                                    {{ fmt((p as any).pricing?.finalPrice ?? p.price) }}
                                </span>
                            </span>
                        </span>
                        <button type="button" :aria-label="`Добавить ${p.name}`" @click="cart.addProduct(p, 1)"
                                class="shrink-0 size-11 rounded-full bg-acc text-white flex items-center justify-center">
                            <Icon name="plus" :size="18" :stroke="2.6" />
                        </button>
                    </div>
                    <!-- Кнопка-плитка «Ещё» в конце ленты -->
                    <button v-if="catalog.products.length > 0"
                            type="button" @click="pickerOpen = true"
                            class="shrink-0 w-[300px] bg-sf border-2 border-dashed border-ln2 rounded-[20px] p-2.5 flex flex-col items-center justify-center gap-1 text-ink active:scale-[0.98] transition">
                        <span class="size-11 rounded-full bg-acc/10 text-acc flex items-center justify-center">
                            <Icon name="plus" :size="22" :stroke="2.6" />
                        </span>
                        <span class="font-extrabold text-[13px]">Ещё</span>
                    </button>
                </div>
            </div>
        </section>

        <UpsellPickerModal v-model:open="pickerOpen" />

        <!-- Summary -->
        <section class="pt-4 px-4">
            <dl class="m-0 bg-sf rounded-[24px] p-[18px] flex flex-col gap-2.5 text-[15px]">
                <div class="flex justify-between">
                    <dt class="text-mut">Товары ({{ cart.count }})</dt>
                    <dd class="m-0 font-bold">{{ fmt(cart.subtotal) }}</dd>
                </div>
                <div v-if="cart.discountTotal" class="flex justify-between">
                    <dt class="text-mut">Скидка</dt>
                    <dd class="m-0 font-extrabold text-acct">−{{ fmt(cart.discountTotal) }}</dd>
                </div>
                <div class="flex justify-between items-baseline">
                    <dt class="text-mut">Доставка</dt>
                    <dd class="m-0 font-bold text-right flex flex-col items-end">
                        <span>Яндекс Такси · клиент оплачивает</span>
                        <RouterLink to="/delivery"
                                    class="text-[12px] font-semibold text-acct underline underline-offset-2">
                            условия и оплата
                        </RouterLink>
                    </dd>
                </div>
                <div class="h-px bg-ln"></div>
                <div class="flex justify-between items-baseline">
                    <dt class="font-extrabold">Итого</dt>
                    <dd class="m-0 font-display font-black text-[22px]">{{ fmt(cart.total) }}</dd>
                </div>
            </dl>
        </section>

        <div class="flex-1 min-h-6"></div>

        <div class="sticky bottom-0 px-4 pt-3 pb-5 bg-bg border-t border-ln">
            <button type="button" @click="router.push('/checkout')"
                    class="w-full h-[60px] rounded-[20px] bg-acc text-white font-extrabold text-[17px] shadow-[0_14px_30px_-12px_rgba(150,40,10,0.7)]">
                Оформить · {{ fmt(cart.total) }}
            </button>
        </div>
    </section>
</template>
