<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useCart } from '@/stores/cart'
import { useCatalog } from '@/stores/catalog'
import Icon from '@/components/Icon.vue'
import type { Order, OrderLine } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const cart = useCart()
const catalog = useCatalog()

const order = computed(() => auth.myOrders.find((o) => o.code === route.params.code))

const ACTIVE: Array<Order['status']> = ['new', 'accepted', 'in_progress']
const isActive = computed(() => order.value && ACTIVE.includes(order.value.status))
const isPaid = computed(() => {
    const ps = order.value?.paymentStatus
    return ps === 'paid' || ps === 'overpaid'
})

function progressStep(s?: Order['status']): number {
    switch (s) {
        case 'new':         return 1
        case 'accepted':    return 2
        case 'in_progress': return 3
        case 'done':        return 4
        default:            return 0
    }
}

/** Группировка строк чека: отдельные товары + блоки по экземпляру набора. */
type ReceiptGroup =
    | { kind: 'product'; line: OrderLine; lineTotalBeforeOrder: number }
    | {
          kind: 'set'
          key: string
          name: string
          lines: OrderLine[]
          base: number              // sum basePrice × qty
          finalBeforeOrder: number  // sum (lineTotal + orderDiscountAmount)
          setDiscount: number       // сумма set+line скидок по строкам инстанса
          setDiscountPercent: number | null
      }

const groupedLines = computed<ReceiptGroup[]>(() => {
    const items = order.value?.items || []
    const groups: ReceiptGroup[] = []
    const bySetInstance = new Map<string, Extract<ReceiptGroup, { kind: 'set' }>>()

    for (const l of items) {
        const unit = Number(l.unitPrice ?? l.price ?? 0)
        const qty = Number(l.qty || 0)
        const lineTotal = Number(l.lineTotal ?? unit * qty)
        const orderCut = Number(l.orderDiscountAmount ?? 0)
        const lineTotalBeforeOrder = lineTotal + orderCut

        // Ключ группы: setInstance (строгий) → orderSetId (fallback для старых заказов).
        const groupKey = l.setInstance || (l.orderSetId ? `set-${l.orderSetId}` : null)
        if (!groupKey) {
            groups.push({ kind: 'product', line: l, lineTotalBeforeOrder })
            continue
        }
        let g = bySetInstance.get(groupKey)
        if (!g) {
            g = {
                kind: 'set',
                key: groupKey,
                name: l.fromSetName || 'Набор',
                lines: [],
                base: 0,
                finalBeforeOrder: 0,
                setDiscount: 0,
                setDiscountPercent: null,
            }
            bySetInstance.set(groupKey, g)
            groups.push(g)
        }
        g.lines.push(l)
        g.base += Number(l.basePrice ?? l.price ?? 0) * qty
        g.finalBeforeOrder += lineTotalBeforeOrder
        for (const d of (l.discounts || [])) {
            if (d.level === 'line' || d.level === 'set') {
                g.setDiscount += Number(d.amount || 0)
                if (g.setDiscountPercent == null && d.benefitType === 'percent') {
                    g.setDiscountPercent = Number(d.benefitValue)
                }
            }
        }
    }
    return groups
})

/** Все order-уровневые скидки заказа (одной строкой «Скидка на весь чек»). */
const orderDiscount = computed(() => {
    const items = order.value?.items || []
    let amount = 0
    let name: string | null = null
    let percent: number | null = null
    for (const l of items) {
        for (const d of (l.discounts || [])) {
            if (d.level !== 'order') continue
            amount += Number(d.amount || 0)
            if (!name) name = d.name
            if (percent == null && d.benefitType === 'percent') percent = Number(d.benefitValue)
        }
    }
    return amount > 0 ? { amount, name, percent } : null
})

/** Сумма «до скидки на весь чек» = итого всех показанных строк. */
const subtotalBeforeOrder = computed(() =>
    groupedLines.value.reduce((s, g) => s + (g.kind === 'set' ? g.finalBeforeOrder : g.lineTotalBeforeOrder), 0),
)

/** Перезабираем заказ при открытии + авто-обновление в фоне, пока заказ активный. */
let pollTimer: number | null = null
function startPolling() {
    if (pollTimer != null) return
    pollTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return
        if (!isActive.value) { stopPolling(); return }
        if (auth.isAuthed) auth.refreshOrders()
    }, 15_000)
}
function stopPolling() {
    if (pollTimer != null) { clearInterval(pollTimer); pollTimer = null }
}
onMounted(() => {
    if (auth.isAuthed) auth.refreshOrders()
})
watch(isActive, (v) => { v ? startPolling() : stopPolling() }, { immediate: true })
onBeforeUnmount(stopPolling)

const STATUS: Record<string, { label: string; color: string }> = {
    new:         { label: 'Новый',       color: 'bg-btr/40 text-ink' },
    accepted:    { label: 'Принят',      color: 'bg-ok-bg text-oks' },
    in_progress: { label: 'В работе',    color: 'bg-sf2 text-acct' },
    done:        { label: 'Доставлен',   color: 'bg-ok-bg text-oks' },
    canceled:    { label: 'Отменён',     color: 'bg-sf2 text-acc' },
}
const statusView = (s?: string) => STATUS[s || 'new'] || STATUS.new

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

function repeat() {
    if (!order.value) return
    cart.clear()
    for (const i of order.value.items) {
        const p = catalog.products.find((pp) => pp.id === i.productId)
        if (p) cart.addProduct(p, i.qty)
    }
    router.push('/cart')
}
</script>

<template>
    <section v-if="order" class="flex-1 flex flex-col">
        <header class="px-4 pt-3.5 pb-2 flex items-center gap-3">
            <button type="button" aria-label="Назад" @click="router.back()"
                    class="size-11 rounded-full bg-sf flex items-center justify-center">
                <Icon name="chevron-left" :size="20" :stroke="2.4" />
            </button>
            <h1 class="m-0 font-display font-black text-[24px] flex-1 truncate">
                Заказ {{ order.code }}
            </h1>
            <div class="flex flex-col items-end gap-1">
                <span class="rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider"
                      :class="statusView(order.status).color">
                    {{ statusView(order.status).label }}
                </span>
                <span v-if="isPaid"
                      class="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-ok-bg text-oks">
                    Оплачен
                </span>
            </div>
        </header>

        <!-- Прогресс активного заказа — как в кабинете. -->
        <section v-if="isActive" class="px-4 pt-2">
            <div class="bg-deep text-deepink rounded-[26px] p-[18px] flex flex-col gap-4">
                <ol aria-label="Статус заказа" class="m-0 p-0 list-none grid grid-cols-4 gap-1">
                    <li v-for="(label, idx) in ['Создан','Принят','В пути','Доставлен']" :key="label"
                        class="flex flex-col gap-2">
                        <span class="h-1.5 rounded-md"
                              :class="progressStep(order.status) >= idx + 1 ? 'bg-btr' : 'bg-deepink/20'"></span>
                        <span class="text-[11px] font-extrabold"
                              :class="progressStep(order.status) >= idx + 1 ? 'text-btr' : 'text-deepmut'">
                            {{ label }}
                        </span>
                    </li>
                </ol>
            </div>
        </section>

        <section class="px-4 pt-2 flex flex-col gap-2.5">
            <div class="bg-sf rounded-[22px] p-[18px] flex flex-col gap-2">
                <div class="text-[12px] font-bold uppercase tracking-wider text-fnt">Создан</div>
                <div class="font-extrabold text-[15px]">
                    {{ new Date(order.createdAt!).toLocaleString('ru-RU') }}
                </div>
            </div>

            <div class="bg-sf rounded-[22px] p-[18px] flex flex-col gap-2">
                <div class="text-[12px] font-bold uppercase tracking-wider text-fnt">Доставка</div>
                <div class="font-extrabold">{{ order.client.fullName }} · {{ order.client.phone }}</div>
                <div class="text-mut">{{ order.client.address || '—' }}</div>
            </div>

            <div v-if="order.cancelReason"
                 class="bg-acc/10 text-acct rounded-[18px] p-4 font-semibold">
                Причина отмены: {{ order.cancelReason }}
            </div>

            <div class="bg-deep text-deepink rounded-[22px] p-[18px] flex flex-col gap-3">
                <template v-for="g in groupedLines" :key="g.kind === 'set' ? g.key : (g.line.productId + '_' + g.line.name)">
                    <!-- Отдельный товар -->
                    <div v-if="g.kind === 'product'" class="flex justify-between items-baseline gap-3 text-[14px]">
                        <span class="text-deepmut flex-1 min-w-0">
                            {{ g.line.name }} × {{ g.line.qty }}
                            <span v-if="g.line.qty > 1" class="text-[12px] opacity-70">
                                · по {{ fmt(Number(g.line.unitPrice ?? g.line.price)) }}
                            </span>
                        </span>
                        <span class="font-bold whitespace-nowrap">{{ fmt(g.lineTotalBeforeOrder) }}</span>
                    </div>
                    <!-- Набор — отдельный блок -->
                    <div v-else class="rounded-[16px] bg-[rgba(255,241,220,0.07)] border border-[rgba(255,241,220,0.14)] p-3 flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <span class="bg-btr text-ink font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full">
                                Набор
                            </span>
                            <span class="font-extrabold text-[14px]">{{ g.name }}</span>
                        </div>
                        <ul class="flex flex-col gap-1 list-none m-0 p-0 pl-1">
                            <li v-for="l in g.lines" :key="l.productId + '_' + l.name"
                                class="flex justify-between items-baseline gap-3 text-[13px] text-deepmut">
                                <span class="flex-1 min-w-0">
                                    · {{ l.name }} × {{ l.qty }}
                                    <span v-if="l.qty > 1" class="text-[12px] opacity-70">
                                        · по {{ fmt(Number(l.basePrice ?? l.price)) }}
                                    </span>
                                </span>
                                <span class="whitespace-nowrap">
                                    {{ fmt(Number(l.basePrice ?? l.price) * l.qty) }}
                                </span>
                            </li>
                        </ul>
                        <div v-if="g.setDiscount > 0" class="flex justify-between items-baseline gap-3 text-[13px]">
                            <span class="text-btr flex-1 min-w-0">
                                Скидка набора<template v-if="g.setDiscountPercent"> −{{ g.setDiscountPercent }}%</template>
                            </span>
                            <span class="font-bold text-btr whitespace-nowrap">− {{ fmt(g.setDiscount) }}</span>
                        </div>
                        <div class="h-px bg-[rgba(255,241,220,0.14)]"></div>
                        <div class="flex justify-between items-baseline text-[14px]">
                            <span class="font-extrabold">Итого набора</span>
                            <span class="font-display font-extrabold text-[16px] text-btr">
                                {{ fmt(g.finalBeforeOrder) }}
                            </span>
                        </div>
                    </div>
                </template>
                <div class="h-px bg-[rgba(255,241,220,0.15)]"></div>
                <div class="flex justify-between text-[14px]">
                    <span class="text-deepmut">Общая сумма</span>
                    <span class="font-bold">{{ fmt(subtotalBeforeOrder) }}</span>
                </div>
                <div v-if="orderDiscount" class="flex justify-between items-baseline gap-3 text-[14px]">
                    <span class="text-btr flex-1 min-w-0">
                        Скидка на весь чек<template v-if="orderDiscount.percent"> −{{ orderDiscount.percent }}%</template>
                        <span v-if="orderDiscount.name" class="block text-[11px] font-semibold opacity-80 truncate">
                            {{ orderDiscount.name }}
                        </span>
                    </span>
                    <span class="font-bold text-btr whitespace-nowrap">− {{ fmt(orderDiscount.amount) }}</span>
                </div>
                <div class="h-px bg-[rgba(255,241,220,0.15)]"></div>
                <div class="flex justify-between items-baseline">
                    <span class="font-extrabold">Итого</span>
                    <span class="font-display font-black text-[22px] text-btr">{{ fmt(order.total) }}</span>
                </div>
            </div>

            <div class="bg-sf rounded-[22px] p-[18px] flex flex-col gap-2 text-[14px]">
                <div class="flex justify-between">
                    <span class="text-mut">Оплата</span>
                    <span class="font-extrabold">
                        {{ order.paymentMethod === 'cash' ? 'Наличными' : 'Картой курьеру' }}
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-mut">Комментарий</span>
                    <span class="font-semibold max-w-[60%] text-right">
                        {{ order.comment || '—' }}
                    </span>
                </div>
            </div>
        </section>

        <div class="flex-1 min-h-6"></div>

        <div class="sticky bottom-0 px-4 pt-3 pb-4 bg-bg flex flex-col gap-2">
            <button type="button" @click="repeat"
                    class="h-[56px] rounded-[18px] bg-acc text-white font-extrabold text-[16px]">
                Повторить заказ
            </button>
            <RouterLink to="/account"
                        class="h-[48px] rounded-[16px] bg-sf text-ink font-extrabold text-[15px] flex items-center justify-center">
                В кабинет
            </RouterLink>
        </div>
    </section>

    <section v-else class="flex-1 flex items-center justify-center text-fnt">
        Заказ не найден
    </section>
</template>
