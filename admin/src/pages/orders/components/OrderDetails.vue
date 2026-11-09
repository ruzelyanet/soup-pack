<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import type { Order, OrderStatus, Transaction } from '@/services/resources'
import { useAuth } from '@/stores/auth'
import {
    buildOrderStages, historyLineLabel,
    STATUS_LABEL, STATUS_PILL,
} from '@/utils/orderFlow'
import ConfirmOrderDialog from './ConfirmOrderDialog.vue'

/** Содержимое карточки заказа: процесс, клиент, доставка, состав, оплата, история.
 *  Используется в боковой панели списка заказов (`layout="panel"`) и на странице заказа (`layout="page"`). */
const props = withDefaults(defineProps<{
    order: Order | null
    events: any[]
    transactions: Transaction[]
    panelBanner?: { text: string } | null
    layout?: 'panel' | 'page'
}>(), { layout: 'panel', panelBanner: null })

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'take'): void
    (e: 'confirm', note: string): void
    (e: 'move', to: OrderStatus): void
    (e: 'cancel'): void
    (e: 'payOpen'): void
    (e: 'refundOpen'): void
    (e: 'cancelTxn', t: Transaction): void
    (e: 'bannerClose'): void
    (e: 'edit'): void
}>()

const auth = useAuth()

/** Править заказ можно, пока клиент его не подтвердил (статус «new»). */
const canEdit = computed(() =>
    props.order?.status === 'new' && (auth.role === 'manager' || auth.role === 'duty'),
)

/** Для «идёт N мин» — обновляем раз в минуту. */
const now = ref(new Date())
let tickTimer: number | null = null
tickTimer = window.setInterval(() => { now.value = new Date() }, 60_000)
onBeforeUnmount(() => { if (tickTimer != null) clearInterval(tickTimer) })

const stages = computed(() => {
    if (!props.order) return []
    return buildOrderStages(props.order as any, props.events as any, now.value)
})

const historyLines = computed(() => {
    if (!props.order) return []
    const o = props.order
    return (props.events as any[]).slice().reverse().map((ev) => ({
        ev,
        line: historyLineLabel(ev, o as any),
    }))
})
const showAllHistory = ref(false)
const visibleHistory = computed(() => showAllHistory.value ? historyLines.value : historyLines.value.slice(0, 5))

const confirmDlgOpen = ref(false)
function emitConfirm(note: string) { emit('confirm', note) }

watch(() => props.order?.id, () => {
    // Переключение на другой заказ — сворачиваем расширенную историю и прокручиваем в начало.
    showAllHistory.value = false
    confirmDlgOpen.value = false
    scrollTopEl.value?.scrollTo({ top: 0 })
})

function fmt(n: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(Number(n || 0))) + ' сум'
}
function relCreated() {
    if (!props.order) return ''
    const diff = Math.max(0, +now.value - +new Date(props.order.createdAt))
    const min = Math.floor(diff / 60_000)
    if (min < 1) return 'только что'
    if (min < 60) return `${min} мин назад`
    return `${Math.floor(min / 60)} ч назад`
}
function fmtTime(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
function fmtDateTime(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleString('ru-RU')
}

/** Группировка строк заказа — тот же алгоритм, что был в Orders.vue. */
type ReceiptGroup =
    | { kind: 'product'; line: any; lineTotalBeforeOrder: number }
    | {
          kind: 'set'; key: string; name: string; lines: any[]
          base: number; finalBeforeOrder: number
          setDiscount: number; setDiscountPercent: number | null; setPromoName: string | null
      }

const groupedLines = computed<ReceiptGroup[]>(() => {
    const items = (props.order as any)?.items || []
    const groups: ReceiptGroup[] = []
    const byKey = new Map<string, Extract<ReceiptGroup, { kind: 'set' }>>()
    for (const l of items) {
        const unit = Number(l.unitPrice ?? l.price ?? 0)
        const qty = Number(l.qty || 0)
        const lineTotal = Number(l.lineTotal ?? unit * qty)
        const orderCut = Number(l.orderDiscountAmount ?? 0)
        const lineTotalBeforeOrder = lineTotal + orderCut
        const groupKey = l.setInstance || (l.orderSetId ? `set-${l.orderSetId}` : null)
        if (!groupKey) {
            groups.push({ kind: 'product', line: l, lineTotalBeforeOrder })
            continue
        }
        let g = byKey.get(groupKey)
        if (!g) {
            g = { kind: 'set', key: groupKey, name: l.fromSetName || 'Набор', lines: [],
                  base: 0, finalBeforeOrder: 0, setDiscount: 0, setDiscountPercent: null, setPromoName: null }
            byKey.set(groupKey, g); groups.push(g)
        }
        g.lines.push(l)
        g.base += Number(l.basePrice ?? l.price ?? 0) * qty
        g.finalBeforeOrder += lineTotalBeforeOrder
        for (const d of (l.discounts || [])) {
            if (d.level === 'line' || d.level === 'set') {
                g.setDiscount += Number(d.amount || 0)
                if (g.setDiscountPercent == null && d.benefitType === 'percent') g.setDiscountPercent = Number(d.benefitValue)
                if (!g.setPromoName) g.setPromoName = d.name || null
            }
        }
    }
    return groups
})

const cartDiscount = computed(() => {
    const o: any = props.order; if (!o) return null
    let amount = 0, percent: number | null = null, name: string | null = null
    for (const i of o.items || []) {
        for (const d of (i.discounts || [])) {
            if (d.level !== 'order') continue
            amount += Number(d.amount || 0)
            if (percent == null && d.benefitType === 'percent') percent = Number(d.benefitValue)
            if (!name) name = d.name
        }
    }
    if (amount > 0) return { amount, percent, name }
    if (Number(o.cartDiscountAmount) > 0) {
        return { amount: Number(o.cartDiscountAmount), percent: Number(o.cartDiscountPercent) || null, name: null }
    }
    return null
})

const paymentLabel: Record<string, string> = {
    unpaid: 'Не оплачен', partial: 'Частично', paid: 'Оплачен',
    overpaid: 'Переплата', refunded: 'Возвращён',
}
const paymentPill: Record<string, string> = {
    unpaid: 'bg-tomato-500/15 text-tomato-500',
    partial: 'bg-saffron-300/40 text-ink-900',
    paid: 'bg-olive-500/15 text-olive-500',
    overpaid: 'bg-saffron-300/40 text-ink-900',
    refunded: 'bg-ink-100 text-ink-500',
}

async function copyLink() {
    if (!props.order) return
    const url = `${location.origin}/admin/orders/${props.order.id}`
    try { await navigator.clipboard.writeText(url) } catch { /* noop */ }
}
async function copyCode() {
    if (!props.order?.code) return
    try { await navigator.clipboard.writeText(props.order.code) } catch { /* noop */ }
}

const menuOpen = ref(false)

function clickAction(kind: string) {
    switch (kind) {
        case 'take':    emit('take'); break
        case 'confirm': confirmDlgOpen.value = true; break
        case 'start':   emit('move', 'in_progress'); break
        case 'pay':     emit('payOpen'); break
        case 'finish':  tryFinish(); break
    }
}

const toast = useToast()

function tryFinish() {
    const o = props.order; if (!o) return
    const unpaid = Math.max(0, Number(o.total) - Number(o.paidAmount ?? 0))
    if (unpaid > 0) {
        toast.add({
            severity: 'warn',
            summary: 'Заказ не оплачен',
            detail: `Остаток ${fmt(unpaid)}. Примите оплату или отмените заказ.`,
            life: 4000,
        })
        return
    }
    emit('move', 'done')
}

const scrollTopEl = ref<HTMLElement | null>(null)

function markerClass(state: string): string {
    if (state === 'done') return 'bg-olive-500 border-olive-500 text-cream-50'
    if (state === 'current') return 'border-primary-500 text-primary-500 bg-white motion-safe:animate-pulse'
    if (state === 'canceled') return 'bg-tomato-500 border-tomato-500 text-cream-50'
    if (state === 'skipped') return 'border-ink-200 text-ink-300 bg-ink-50'
    return 'border-ink-200 text-ink-300 bg-white'
}
</script>

<template>
    <div v-if="order" ref="scrollTopEl" :class="layout === 'panel' ? 'space-y-5 bg-cream-50 -m-5 p-5 min-h-full' : 'space-y-5'">
            <!-- Мета (код + статус + источник + время + "Отменить/⋯") вместо старой sticky-шапки. -->
            <div v-if="layout === 'panel'" class="flex items-center gap-2 flex-wrap">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                      :class="STATUS_PILL[order.status]">
                    {{ STATUS_LABEL[order.status] }}
                </span>
                <span class="text-xs text-ink-500">
                    {{ order.source === 'catalog' ? 'из каталога' : order.source === 'telegram' ? 'через Telegram' : order.source === 'manual' ? 'вручную' : 'из заявки' }}
                </span>
                <span class="text-xs text-ink-400">· {{ fmtTime(order.createdAt) }}, {{ relCreated() }}</span>
                <div class="ml-auto flex items-center gap-1">
                    <RouterLink :to="{ name: 'order', params: { id: order.id } }"
                                class="text-ink-700 hover:text-ink-900 text-xs font-semibold px-2 py-1 inline-flex items-center gap-1 no-underline">
                        <i class="pi pi-external-link text-[11px]"></i>Открыть
                    </RouterLink>
                    <button v-if="canEdit"
                            class="text-ink-700 hover:text-ink-900 text-xs font-semibold px-2 py-1 inline-flex items-center gap-1"
                            type="button" @click="emit('edit')">
                        <i class="pi pi-pencil text-[11px]"></i>Редактировать
                    </button>
                    <button v-if="order.status !== 'done' && order.status !== 'canceled'"
                            class="text-tomato-500 hover:text-tomato-600 text-xs font-semibold px-2 py-1"
                            type="button" @click="emit('cancel')">
                        Отменить
                    </button>
                    <div class="relative">
                        <button class="rounded-md p-1.5 hover:bg-ink-100 text-ink-500" type="button"
                                @click="menuOpen = !menuOpen">
                            <i class="pi pi-ellipsis-h text-xs"></i>
                        </button>
                        <div v-if="menuOpen"
                             class="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg ring-1 ring-ink-100 py-1 z-20 text-sm"
                             @click="menuOpen = false">
                            <RouterLink :to="{ name: 'order', params: { id: order.id } }"
                                        class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-900 no-underline">
                                <i class="pi pi-external-link text-xs mr-2"></i>Открыть страницу заказа
                            </RouterLink>
                            <button class="w-full text-left px-3 py-1.5 hover:bg-ink-50" type="button" @click="copyLink">
                                <i class="pi pi-link text-xs mr-2"></i>Скопировать ссылку
                            </button>
                            <button class="w-full text-left px-3 py-1.5 hover:bg-ink-50" type="button" @click="copyCode">
                                <i class="pi pi-copy text-xs mr-2"></i>Скопировать номер
                            </button>
                        </div>
                    </div>
                </div>
            </div>
                <div v-if="panelBanner"
                     class="rounded-xl bg-saffron-300/15 text-ink-700 text-sm px-3 py-2 flex items-center gap-2">
                    <i class="pi pi-sync text-saffron-500"></i>
                    <span class="flex-1">{{ panelBanner.text }}</span>
                    <button class="text-ink-400 hover:text-ink-700" type="button" @click="emit('bannerClose')">
                        <i class="pi pi-times text-xs"></i>
                    </button>
                </div>

                <!-- Процесс -->
                <section v-if="layout === 'panel'" class="bg-white rounded-2xl ring-1 ring-ink-100 p-5">
                    <h3 class="font-display font-bold text-base mb-4">Процесс</h3>
                    <ol class="space-y-0 m-0 p-0 list-none">
                        <li v-for="(s, idx) in stages" :key="s.key" class="relative pl-10">
                            <!-- Коннектор -->
                            <span v-if="idx < stages.length - 1"
                                  class="absolute left-[14px] top-7 bottom-0 w-px"
                                  :class="s.state === 'done' ? 'bg-olive-500' : 'bg-ink-200'"
                                  :style="s.state === 'upcoming' || s.state === 'skipped' ? 'border-left: 1px dashed; background: transparent;' : ''"></span>
                            <!-- Маркер -->
                            <span class="absolute left-0 top-1 inline-flex items-center justify-center w-7 h-7 rounded-full border-2"
                                  :class="markerClass(s.state)">
                                <i v-if="s.state === 'done'" class="pi pi-check text-[11px]"></i>
                                <i v-else-if="s.state === 'canceled'" class="pi pi-times text-[11px]"></i>
                                <span v-else-if="s.state === 'current'" class="w-2 h-2 rounded-full bg-current"></span>
                            </span>

                            <div class="pb-5" :class="s.state === 'current' ? 'bg-primary-50/40 -mx-2 px-2 rounded-xl' : ''">
                                <div class="flex items-baseline gap-2 flex-wrap">
                                    <span class="font-display font-bold text-sm"
                                          :class="s.state === 'skipped' ? 'line-through text-ink-400' : ''">
                                        {{ s.title }}
                                    </span>
                                    <span v-if="s.actor" class="text-xs text-ink-500">{{ s.actor.fullName }}</span>
                                    <span v-if="s.at" class="text-xs text-ink-400">· {{ fmtTime(s.at) }}</span>
                                    <span v-if="s.state === 'done' && s.durationMin != null" class="text-xs text-ink-400">
                                        · через {{ s.durationMin }} мин
                                    </span>
                                    <span v-else-if="s.state === 'current' && s.durationMin != null"
                                          class="ml-auto text-xs text-ink-400">
                                        идёт {{ s.durationMin }} мин
                                    </span>
                                    <span v-else-if="s.state === 'canceled' && s.durationMin != null"
                                          class="ml-auto text-xs text-tomato-500">
                                        отменён через {{ s.durationMin }} мин
                                    </span>
                                </div>
                                <p v-if="s.state === 'current' || s.state === 'canceled'"
                                   class="text-xs text-ink-500 mt-1 whitespace-pre-line">
                                    {{ s.description }}
                                </p>
                                <p v-else-if="s.state === 'upcoming' || s.state === 'skipped'"
                                   class="text-xs text-ink-400 mt-0.5 truncate">
                                    {{ s.description }}
                                </p>
                                <p v-if="s.state === 'canceled' && order.cancelReason"
                                   class="text-xs text-tomato-500 mt-1">
                                    Причина: {{ order.cancelReason }}
                                </p>

                                <div v-if="s.state === 'current' && s.action" class="mt-3 flex gap-2 flex-wrap">
                                    <a v-if="s.action.kind === 'confirm' && order.client?.phone"
                                       :href="`tel:${order.client.phone}`"
                                       class="inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-ink-200 text-xs font-semibold px-3 py-1.5 hover:ring-ink-400">
                                        <i class="pi pi-phone text-[11px]"></i>
                                        {{ order.client.phone }}
                                    </a>
                                    <Button :label="s.action.label" size="small"
                                            :severity="s.action.kind === 'take' ? 'secondary' : 'primary'"
                                            @click="clickAction(s.action.kind)" />
                                </div>
                            </div>
                        </li>
                    </ol>
                </section>

                <!-- Процесс (страница): горизонтальный -->
                <section v-else aria-label="Процесс" class="bg-white rounded-2xl ring-1 ring-ink-100 px-5 py-5">
                    <ol class="m-0 p-0 list-none grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
                        <li v-for="(s, idx) in stages" :key="s.key"
                            class="flex flex-col gap-2 rounded-2xl"
                            :class="s.state === 'current' ? 'bg-primary-50 -my-2.5 py-2.5 px-3 lg:-mx-1.5' : s.state === 'canceled' ? 'bg-tomato-500/10 -my-2.5 py-2.5 px-3 lg:-mx-1.5' : 'lg:px-0'">
                            <div class="flex items-center gap-2">
                                <span class="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border-2"
                                      :class="markerClass(s.state)">
                                    <i v-if="s.state === 'done'" class="pi pi-check text-[11px]"></i>
                                    <i v-else-if="s.state === 'canceled'" class="pi pi-times text-[11px]"></i>
                                    <span v-else-if="s.state === 'current'" class="w-2 h-2 rounded-full bg-current"></span>
                                </span>
                                <span v-if="idx < stages.length - 1" class="hidden lg:block flex-1 h-0 border-t-2"
                                      :class="s.state === 'done' ? 'border-olive-500' : 'border-dashed border-ink-200'"></span>
                            </div>
                            <span class="font-display font-bold text-sm"
                                  :class="s.state === 'skipped' ? 'line-through text-ink-400' : s.state === 'upcoming' ? 'text-ink-500' : ''">
                                {{ s.title }}
                            </span>
                            <span class="text-xs text-ink-500">
                                <template v-if="s.state === 'done'">
                                    {{ [s.actor?.fullName, s.at ? fmtTime(s.at) : null].filter(Boolean).join(' · ') || 'пройден' }}
                                    <template v-if="s.durationMin != null"> · через {{ s.durationMin }} мин</template>
                                </template>
                                <template v-else-if="s.state === 'current'">
                                    <template v-if="s.durationMin != null">идёт {{ s.durationMin }} мин · </template>{{ s.description }}
                                </template>
                                <template v-else-if="s.state === 'canceled'">
                                    <span class="text-tomato-600">Отменён<template v-if="order.cancelReason">: {{ order.cancelReason }}</template></span>
                                </template>
                                <template v-else>{{ s.description }}</template>
                            </span>
                            <div v-if="s.state === 'current' && s.action" class="flex gap-1.5 flex-wrap">
                                <a v-if="s.action.kind === 'confirm' && order.client?.phone"
                                   :href="`tel:${order.client.phone}`"
                                   class="inline-flex items-center gap-1.5 h-9 rounded-lg bg-white ring-1 ring-primary-200 text-xs font-semibold px-2.5 text-ink-900 no-underline">
                                    <i class="pi pi-phone text-[11px]"></i>Позвонить
                                </a>
                                <Button :label="s.action.label" size="small"
                                        :severity="s.action.kind === 'take' ? 'secondary' : 'primary'"
                                        @click="clickAction(s.action.kind)" />
                            </div>
                        </li>
                    </ol>
                </section>

                <div :class="layout === 'page'
                    ? 'grid gap-5 items-start lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:grid-rows-[auto_auto_auto_1fr]'
                    : 'space-y-5'">
                <!-- Клиент -->
                <section class="lg:col-start-2 bg-white rounded-2xl ring-1 ring-ink-100 p-5" v-if="order.client">
                    <h3 class="font-display font-bold text-base mb-3">
                        <i class="pi pi-user text-sm text-ink-400 mr-1.5"></i>Клиент
                    </h3>
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-ink-100 inline-flex items-center justify-center text-sm font-semibold text-ink-500">
                            {{ (order.client.fullName || '?').trim().slice(0, 1).toUpperCase() }}
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-semibold">{{ order.client.fullName || '—' }}</div>
                            <a :href="`tel:${order.client.phone}`" class="text-sm text-primary-600 hover:underline">
                                {{ order.client.phone }}
                            </a>
                        </div>
                    </div>
                </section>

                <!-- Доставка -->
                <section class="lg:col-start-2 bg-white rounded-2xl ring-1 ring-ink-100 p-5">
                    <h3 class="font-display font-bold text-base mb-3">
                        <i class="pi pi-send text-sm text-ink-400 mr-1.5"></i>Доставка
                    </h3>
                    <div class="text-sm">
                        <template v-if="order.deliveryMethod === 'courier_now'">🚴 Курьером сейчас</template>
                        <template v-else>
                            📅 Предзаказ{{ order.deliverySlotAt ? ' на ' + fmtDateTime(order.deliverySlotAt) : '' }}
                        </template>
                    </div>
                    <div class="text-sm text-ink-700 mt-2">{{ order.address || '—' }}</div>
                    <div v-if="order.lat != null && order.lng != null" class="mt-1">
                        <a :href="`https://www.openstreetmap.org/?mlat=${order.lat}&mlon=${order.lng}#map=18/${order.lat}/${order.lng}`"
                           target="_blank" rel="noopener"
                           class="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline">
                            <i class="pi pi-external-link text-[11px]"></i>Открыть на карте
                        </a>
                    </div>
                    <div v-else-if="order.address" class="mt-1.5 text-xs font-semibold text-ink-900 bg-cream-100 ring-1 ring-saffron-300 rounded-lg px-2.5 py-1.5">
                        📍 Точка на карте не указана — уточните у клиента и отметьте её через «Редактировать».
                    </div>
                    <div v-if="order.comment" class="mt-2 text-xs text-ink-500 whitespace-pre-line">
                        <span class="font-semibold">Комментарий: </span>{{ order.comment }}
                    </div>
                </section>

                <!-- Состав -->
                <section class="lg:col-start-1 lg:row-start-1 lg:row-span-4 bg-white rounded-2xl ring-1 ring-ink-100 p-5">
                    <h3 class="font-display font-bold text-base mb-3">
                        <i class="pi pi-shopping-bag text-sm text-ink-400 mr-1.5"></i>Состав
                    </h3>
                    <template v-for="g in groupedLines" :key="g.kind === 'set' ? g.key : (g.line.productId + '_' + g.line.name)">
                        <div v-if="g.kind === 'product'" class="py-1.5">
                            <div class="flex justify-between items-baseline gap-2 text-sm">
                                <span class="flex-1 min-w-0">
                                    {{ g.line.name }} × {{ g.line.qty }}
                                    <span v-if="g.line.qty > 1" class="text-[11px] text-ink-400">
                                        · по {{ fmt(Number(g.line.unitPrice ?? g.line.price)) }}
                                    </span>
                                </span>
                                <span class="font-semibold whitespace-nowrap">{{ fmt(g.lineTotalBeforeOrder) }}</span>
                            </div>
                        </div>
                        <div v-else class="my-2 rounded-xl bg-saffron-300/10 border border-saffron-300/40 p-3 space-y-2">
                            <div class="flex items-center gap-2">
                                <span class="inline-flex items-center gap-1 bg-saffron-300/40 text-ink-900 font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full">
                                    <i class="pi pi-th-large text-[9px]"></i>Набор
                                </span>
                                <span class="font-semibold text-sm">{{ g.name }}</span>
                            </div>
                            <ul class="list-none m-0 p-0 pl-1 space-y-0.5">
                                <li v-for="l in g.lines" :key="l.productId + '_' + l.name"
                                    class="flex justify-between items-baseline gap-2 text-[13px] text-ink-500">
                                    <span class="flex-1 min-w-0">· {{ l.name }} × {{ l.qty }}</span>
                                    <span class="whitespace-nowrap">{{ fmt(Number(l.basePrice ?? l.price) * l.qty) }}</span>
                                </li>
                            </ul>
                            <div v-if="g.setDiscount > 0" class="flex justify-between text-[13px]">
                                <span class="text-tomato-600">
                                    Скидка<template v-if="g.setDiscountPercent"> −{{ g.setDiscountPercent }}%</template>
                                </span>
                                <span class="font-semibold text-tomato-600">− {{ fmt(g.setDiscount) }}</span>
                            </div>
                            <div class="border-t border-saffron-300/40 pt-2 flex justify-between text-sm">
                                <span class="font-extrabold">Итого набора</span>
                                <span class="font-display font-extrabold">{{ fmt(g.finalBeforeOrder) }}</span>
                            </div>
                        </div>
                    </template>
                    <div class="border-t border-ink-200 mt-2 pt-2 space-y-1">
                        <div class="flex justify-between text-sm">
                            <span class="text-ink-500">Сумма товаров</span>
                            <span class="font-semibold">{{ fmt(Number(order.subtotal ?? order.total)) }}</span>
                        </div>
                        <div v-if="cartDiscount" class="flex justify-between text-sm">
                            <span class="text-tomato-600">
                                Скидка на весь чек<template v-if="cartDiscount.percent"> −{{ cartDiscount.percent }}%</template>
                            </span>
                            <span class="font-semibold text-tomato-600">− {{ fmt(cartDiscount.amount) }}</span>
                        </div>
                        <div class="flex justify-between pt-1">
                            <span class="text-sm text-ink-500">Итого</span>
                            <span class="font-display font-extrabold">{{ fmt(Number(order.total)) }}</span>
                        </div>
                    </div>
                </section>

                <!-- Оплата -->
                <section class="lg:col-start-2 bg-white rounded-2xl ring-1 ring-ink-100 p-5">
                    <div class="flex items-center mb-3">
                        <h3 class="font-display font-bold text-base">
                            <i class="pi pi-wallet text-sm text-ink-400 mr-1.5"></i>Оплата
                        </h3>
                        <span class="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                              :class="paymentPill[order.paymentStatus || 'unpaid']">
                            {{ paymentLabel[order.paymentStatus || 'unpaid'] }}
                        </span>
                        <div class="ml-auto flex gap-2">
                            <Button v-if="order.status !== 'canceled' && (order.paidAmount ?? 0) < Number(order.total)"
                                    label="Принять оплату" icon="pi pi-wallet" size="small"
                                    @click="emit('payOpen')" />
                            <Button v-if="auth.role === 'manager' && (order.paidAmount ?? 0) > 0"
                                    label="Возврат" icon="pi pi-undo" severity="danger" outlined size="small"
                                    @click="emit('refundOpen')" />
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-sm">
                        <div class="bg-ink-50 rounded-lg p-2">
                            <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Сумма</div>
                            <div class="font-semibold">{{ fmt(Number(order.total)) }}</div>
                        </div>
                        <div class="bg-ink-50 rounded-lg p-2">
                            <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Оплачено</div>
                            <div class="font-semibold">{{ fmt(Number(order.paidAmount ?? 0)) }}</div>
                        </div>
                        <div class="bg-ink-50 rounded-lg p-2">
                            <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Остаток</div>
                            <div class="font-semibold">{{ fmt(Math.max(0, Number(order.total) - Number(order.paidAmount ?? 0))) }}</div>
                        </div>
                    </div>
                    <div v-if="(order.status as string) === 'canceled' && (order.paidAmount ?? 0) > 0"
                         class="mt-2 text-xs text-tomato-500">
                        Нужен возврат: {{ fmt(Number(order.paidAmount)) }}
                    </div>
                    <div v-if="transactions.length" class="mt-3 border-t border-ink-100 pt-3">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">История транзакций</div>
                        <div class="space-y-1">
                            <div v-for="t in transactions" :key="t.id"
                                 class="text-xs flex items-center gap-2"
                                 :class="t.status === 'cancelled' ? 'opacity-50 line-through' : ''">
                                <span class="font-mono">{{ t.code }}</span>
                                <span :class="t.kind === 'refund' ? 'text-tomato-500' : 'text-olive-500'">
                                    {{ t.kind === 'refund' ? '−' : '+' }}{{ fmt(Number(t.amount)) }}
                                </span>
                                <span class="text-ink-400">{{ t.method }}</span>
                                <span v-if="t.receivedBy" class="text-ink-400">· {{ t.receivedBy.fullName }}</span>
                                <span class="text-ink-400 ml-auto">{{ fmtDateTime(t.paidAt) }}</span>
                                <button v-if="auth.role === 'manager' && t.status === 'completed'"
                                        type="button" class="text-tomato-500 hover:underline"
                                        @click="emit('cancelTxn', t)">сторно</button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- История -->
                <section class="lg:col-start-2 self-start bg-white rounded-2xl ring-1 ring-ink-100 p-5">
                    <h3 class="font-display font-bold text-base mb-3">
                        <i class="pi pi-history text-sm text-ink-400 mr-1.5"></i>История
                    </h3>
                    <ul v-if="historyLines.length" class="space-y-2 m-0 p-0 list-none">
                        <li v-for="(item, idx) in visibleHistory" :key="idx"
                            class="flex items-baseline gap-2 text-sm">
                            <i :class="['pi', item.line.icon, 'text-xs text-ink-400 w-4']"></i>
                            <span class="font-medium">{{ item.line.title }}</span>
                            <span v-if="item.line.detail" class="text-ink-500 truncate">· {{ item.line.detail }}</span>
                            <span class="ml-auto text-xs text-ink-400 whitespace-nowrap">
                                <template v-if="item.ev.actor">{{ item.ev.actor.fullName }} · </template>
                                {{ fmtDateTime(item.ev.publishedAt || item.ev.createdAt) }}
                            </span>
                        </li>
                    </ul>
                    <div v-else class="text-xs text-ink-400">Событий пока нет.</div>
                    <button v-if="historyLines.length > 5"
                            class="mt-2 text-xs font-semibold text-primary-600 hover:underline"
                            type="button" @click="showAllHistory = !showAllHistory">
                        {{ showAllHistory ? 'Свернуть' : `Показать всё (${historyLines.length})` }}
                    </button>
                </section>
                </div>
        </div>

    <ConfirmOrderDialog v-model:visible="confirmDlgOpen" :order="order" @confirm="emitConfirm" />
</template>
