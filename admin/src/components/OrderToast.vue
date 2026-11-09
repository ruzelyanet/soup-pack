<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Toast, { type ToastMessageOptions } from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useOrdersFeed } from '@/stores/ordersFeed'
import { useAuth } from '@/stores/auth'
import { api } from '@/services/api'
import type { OrderSummary } from '@/services/realtime'
import { playOrderChime, showSystemNotification } from '@/services/notifyPrefs'

const GROUP = 'orders'
const MAX_TOASTS = 3
const LIFE_MS = 20_000
const SUMMARY_KEY = '__orders_summary__'

type Entry = {
    key: string
    orderId: number
    summary: OrderSummary
    at: number
    takenBy?: string
}

const toast = useToast()
const router = useRouter()
const route = useRoute()
const feed = useOrdersFeed()
const auth = useAuth()

const entries = ref<Map<string, Entry>>(new Map())
const overflow = ref<Entry[]>([])
const tick = ref(0)
let tickTimer: number | null = null

const sourceLabel: Record<OrderSummary['source'], string> = {
    catalog: 'из каталога', request: 'из заявки', manual: 'вручную', telegram: 'через Telegram',
}

function fmt(n: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(Number(n || 0))) + ' сум'
}
function formatRel(fromMs: number): string {
    void tick.value
    const diff = Math.max(0, Date.now() - fromMs)
    const min = Math.floor(diff / 60_000)
    if (min < 1) return 'только что'
    if (min < 60) return `${min} мин назад`
    return `${Math.floor(min / 60)} ч назад`
}
function deliveryLine(s: OrderSummary): string {
    if (s.deliveryMethod === 'courier_now') return `Курьером сейчас · ${s.paymentMethod} · ${sourceLabel[s.source]}`
    const d = s.deliverySlotAt ? new Date(s.deliverySlotAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }) : null
    return `Предзаказ${d ? ' на ' + d : ''} · ${s.paymentMethod} · ${sourceLabel[s.source]}`
}

const summaryOverflowCount = computed(() => overflow.value.length)

const canNotify = computed(() => auth.employee?.role === 'manager' || auth.employee?.role === 'duty')

function toastExists(key: string): boolean {
    return key === SUMMARY_KEY ? overflow.value.length > 0 : entries.value.has(key)
}
function pushToast(entry: Entry) {
    entries.value.set(entry.key, entry)
    toast.add({ group: GROUP, severity: 'success', summary: entry.key, life: LIFE_MS })
}
function ensureSummaryToast() {
    if (toastExists(SUMMARY_KEY)) return
    toast.add({ group: GROUP, severity: 'info', summary: SUMMARY_KEY })
}

function remove(key: string) {
    entries.value.delete(key)
    overflow.value = overflow.value.filter((e) => e.key !== key)
}

function openOrder(id: number, key: string) {
    feed.markSeen(id)
    remove(key)
    router.push({ path: '/orders', query: { ...route.query, open: String(id) } })
}

function openAll() {
    overflow.value.splice(0)
    toast.removeGroup(GROUP)
    entries.value.clear()
    router.push({ path: '/orders' })
}

async function takeFromToast(entry: Entry) {
    try {
        await api.post(`/staff/orders/${entry.orderId}/take`, {})
        openOrder(entry.orderId, entry.key)
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        if (e?.response?.status === 409 || code === 'ALREADY_TAKEN') {
            entry.takenBy = 'коллегой'  // имя не приходит сервером отдельно — коротко
            entries.value.set(entry.key, { ...entry })
        }
    }
}

function onCreated(e: { orderId: number; summary: OrderSummary }) {
    if (!canNotify.value) return
    if (route.path === '/orders' && String(route.query.open || '') === String(e.orderId)) return
    const entry: Entry = {
        key: `order-${e.orderId}`,
        orderId: e.orderId,
        summary: e.summary,
        at: Date.parse(e.summary.createdAt) || Date.now(),
    }
    if (entries.value.has(entry.key)) return
    if (entries.value.size >= MAX_TOASTS) { overflow.value.push(entry); ensureSummaryToast(); return }
    pushToast(entry)
    if (feed.isLeader) {
        playOrderChime()
        showSystemNotification(
            `Новый заказ · ${e.summary.code}`,
            `${e.summary.clientName || ''} · ${fmt(e.summary.total)}`,
            () => openOrder(e.orderId, entry.key),
        )
    }
}

function onUpdated(e: { orderId: number; kind: string; status: string }) {
    // Если заказ, по которому висит тост «новый», ушёл из new — тост больше не актуален.
    if (e.kind === 'taken' || (e.kind === 'status_changed' && e.status !== 'new')) {
        remove(`order-${e.orderId}`)
    }
}

function onToastClose(ev: { message: ToastMessageOptions }) {
    const k = ev.message.summary as string
    if (!k) return
    if (k === SUMMARY_KEY) { overflow.value.splice(0); return }
    entries.value.delete(k)
}

let offCreated: (() => void) | null = null
let offUpdated: (() => void) | null = null

onMounted(() => {
    offCreated = feed.onCreated(onCreated)
    offUpdated = feed.onUpdated(onUpdated)
    tickTimer = window.setInterval(() => { tick.value++ }, 30_000)
})
onBeforeUnmount(() => {
    offCreated?.(); offUpdated?.()
    if (tickTimer != null) clearInterval(tickTimer)
})
</script>

<template>
    <Toast :group="GROUP" position="top-right" @close="onToastClose" @life-end="onToastClose">
        <template #message="slot">
            <template v-if="(slot.message.summary as string) === SUMMARY_KEY">
                <div v-if="summaryOverflowCount > 0" class="w-[360px]">
                    <div class="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-lg ring-1 ring-ink-100">
                        <div class="w-10 h-10 rounded-xl inline-flex items-center justify-center bg-ink-100 text-ink-500 shrink-0">
                            <i class="pi pi-ellipsis-h text-base"></i>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-display font-extrabold text-sm">+ ещё {{ summaryOverflowCount }} новых заказов</div>
                            <div class="text-[11px] text-ink-400 mt-0.5">Открой список, чтобы увидеть все</div>
                        </div>
                        <button class="rounded-lg bg-ink-900 text-cream-50 text-xs font-semibold px-3 py-1.5 hover:bg-ink-700 transition"
                                type="button" @click="openAll">
                            К заказам
                        </button>
                    </div>
                </div>
            </template>
            <template v-else>
                <template v-for="entry in [entries.get(slot.message.summary as string)]" :key="entry?.key || 'nil'">
                    <div v-if="entry" class="w-[360px]">
                        <div class="flex items-start gap-3 p-3 bg-white rounded-2xl shadow-lg ring-1 ring-olive-500/40">
                            <div class="w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 bg-olive-500/15 text-olive-500">
                                <i class="pi pi-receipt text-base"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-baseline gap-2">
                                    <div class="font-display font-extrabold text-sm">Новый заказ</div>
                                    <code class="font-mono text-[11px] text-ink-500">{{ entry.summary.code }}</code>
                                    <span class="ml-auto text-[11px] text-ink-400 whitespace-nowrap">
                                        {{ formatRel(entry.at) }}
                                    </span>
                                </div>
                                <div class="text-sm text-ink-700 truncate mt-0.5">{{ entry.summary.clientName || '—' }}</div>
                                <div class="text-sm mt-0.5">
                                    <span class="text-ink-500">{{ entry.summary.itemsCount }} позиции · </span>
                                    <span class="font-display font-extrabold">{{ fmt(entry.summary.total) }}</span>
                                </div>
                                <div class="text-[11px] text-ink-400 mt-0.5 truncate">
                                    {{ deliveryLine(entry.summary) }}
                                </div>
                                <div v-if="entry.takenBy" class="text-[11px] text-saffron-500 mt-1">
                                    Заказ уже взял {{ entry.takenBy }}
                                </div>
                                <div class="mt-2 flex gap-2">
                                    <button class="rounded-lg bg-ink-900 text-cream-50 text-xs font-semibold px-3 py-1.5 hover:bg-ink-700 transition"
                                            type="button" @click="openOrder(entry.orderId, entry.key)">
                                        Открыть
                                    </button>
                                    <button v-if="!entry.takenBy && entry.summary.status === 'new'"
                                            class="rounded-lg bg-olive-500 text-cream-50 text-xs font-semibold px-3 py-1.5 hover:bg-olive-600 transition"
                                            type="button" @click="takeFromToast(entry)">
                                        Взять в работу
                                    </button>
                                </div>
                            </div>
                            <button class="text-ink-300 hover:text-ink-500" type="button" @click="remove(entry.key)">
                                <i class="pi pi-times text-xs"></i>
                            </button>
                        </div>
                    </div>
                </template>
            </template>
        </template>
    </Toast>
</template>
