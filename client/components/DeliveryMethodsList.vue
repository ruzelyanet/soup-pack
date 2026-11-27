<!-- Способы доставки из админки (сущность «Доставка»): название, описание, цена и привязанная скидка.
     compact — строки в чеке корзины; full — карточки на странице «Доставка и оплата». -->
<script setup lang="ts">
import { computed } from 'vue'
import { useCatalog, type DeliveryMethodOption } from '@/stores/catalog'
import Icon from '@/components/Icon.vue'

const props = withDefaults(defineProps<{
    /** Сумма товаров — чтобы подсказать, сколько не хватает до скидки. 0 — не знаем (страница доставки). */
    subtotal?: number
    variant?: 'compact' | 'full'
}>(), { subtotal: 0, variant: 'compact' })

const catalog = useCatalog()
const methods = computed(() => [...(catalog.deliveryMethods || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)))

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' сум'
}
function priceText(m: DeliveryMethodOption) {
    return m.price > 0 ? fmt(m.price) : 'бесплатно'
}

/** Скидка способа доставки: текст выгоды, порог и сколько не хватает. */
function discountOf(m: DeliveryMethodOption) {
    const p = m.preview
    if (!p || !p.benefitValue) return null
    const benefit = p.benefitType === 'percent' ? `−${p.benefitValue}% к заказу`
        : p.benefitType === 'fixed_amount' ? `−${fmt(p.benefitValue)} к заказу`
        : `заказ за ${fmt(p.benefitValue)}`
    const min = p.minSubtotal || 0
    const missing = min && props.subtotal > 0 ? Math.max(0, min - props.subtotal) : 0
    return {
        benefit,
        label: p.label && p.label !== benefit ? p.label : '',
        min,
        missing,
        /** true — условие по сумме выполнено (или его нет). */
        reached: !min || (props.subtotal > 0 && missing === 0),
    }
}
</script>

<template>
    <!-- ───── Чек корзины ───── -->
    <ul v-if="variant === 'compact'" class="list-none m-0 p-0 flex flex-col gap-2.5">
        <li v-if="!methods.length" class="text-[13px] text-fnt">Способ доставки выберете при оформлении.</li>
        <li v-for="m in methods" :key="m.code" class="flex flex-col gap-1">
            <div class="flex items-baseline justify-between gap-3">
                <span class="font-bold text-[14px] text-ink min-w-0">{{ m.name }}</span>
                <span class="font-bold text-[14px] shrink-0" :class="m.price > 0 ? 'text-ink' : 'text-oks'">{{ priceText(m) }}</span>
            </div>
            <p v-if="m.description" class="m-0 text-[12px] text-fnt leading-snug line-clamp-2">{{ m.description }}</p>
            <template v-if="discountOf(m)">
                <span class="self-start inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                      :class="discountOf(m)!.reached ? 'bg-ok-bg text-oks' : 'bg-acc/10 text-acct'">
                    <Icon :name="discountOf(m)!.reached ? 'check' : 'sparkles'" :size="12" :stroke="2.6" />
                    {{ discountOf(m)!.benefit }}<template v-if="discountOf(m)!.min && !discountOf(m)!.reached"> от {{ fmt(discountOf(m)!.min) }}</template>
                </span>
                <span v-if="discountOf(m)!.missing" class="text-[11px] text-fnt">
                    Добавьте ещё на {{ fmt(discountOf(m)!.missing) }}, чтобы получить скидку
                </span>
            </template>
        </li>
    </ul>

    <!-- ───── Страница «Доставка и оплата» ───── -->
    <div v-else class="flex flex-col gap-3">
        <div v-if="!methods.length" class="bg-sf rounded-[22px] p-5 text-[14px] text-fnt">
            Способы доставки уточнит менеджер после оформления заказа.
        </div>
        <article v-for="m in methods" :key="m.code" class="bg-sf rounded-[22px] p-4 flex gap-3.5">
            <span class="size-12 rounded-2xl bg-acc/10 text-acct flex items-center justify-center shrink-0">
                <Icon name="map-pin" :size="22" :stroke="2.2" />
            </span>
            <div class="flex-1 min-w-0 flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between gap-3">
                    <h3 class="m-0 font-display font-extrabold text-[17px] leading-tight">{{ m.name }}</h3>
                    <span class="font-extrabold text-[15px] shrink-0" :class="m.price > 0 ? 'text-ink' : 'text-oks'">{{ priceText(m) }}</span>
                </div>
                <p v-if="m.description" class="m-0 text-[14px] text-mut leading-relaxed whitespace-pre-line">{{ m.description }}</p>
                <div v-if="discountOf(m)" class="self-start inline-flex items-center gap-1.5 rounded-full bg-ok-bg text-oks px-2.5 py-1 text-[12px] font-extrabold">
                    <Icon name="sparkles" :size="13" :stroke="2.6" />
                    {{ discountOf(m)!.benefit }}<template v-if="discountOf(m)!.min"> при заказе от {{ fmt(discountOf(m)!.min) }}</template>
                </div>
                <span v-if="discountOf(m)?.label" class="text-[12px] text-fnt">{{ discountOf(m)!.label }}</span>
            </div>
        </article>
    </div>
</template>
