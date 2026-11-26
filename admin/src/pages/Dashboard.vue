<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppTopbar from '@/components/AppTopbar.vue'
import PeriodPicker, { type PeriodKey } from '@/components/PeriodPicker.vue'
import OrdersGeo from '@/components/OrdersGeo.vue'
import { Orders, type DashboardData, type Order } from '@/services/resources'
import { Settings } from '@/services/settings'
import { useOrdersFeed } from '@/stores/ordersFeed'

/* ───────────── Период ───────────── */
const PERIODS: PeriodKey[] = ['today', 'yesterday', 'week', 'month', 'this-month', 'year', 'null', 'other']
const STORAGE_KEY = 'souppack.admin.dashboard.period'

function defaultRange(): [Date, Date] {
    const end = new Date(); end.setHours(23, 59, 59, 999)
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6)
    return [start, end]
}
/** Запоминаем выбор: сохраняем длину пресета в днях (или «всё время»), а не даты — чтобы «7 дней» оставались актуальными. */
function restoreRange(): [Date, Date] | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return defaultRange()
        const v = JSON.parse(raw) as { all?: boolean; from?: string; to?: string; days?: number; endsToday?: boolean }
        if (v.all) return null
        if (v.endsToday && v.days) {
            const end = new Date(); end.setHours(23, 59, 59, 999)
            const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (v.days - 1))
            return [start, end]
        }
        if (v.from && v.to) return [new Date(v.from), new Date(v.to)]
    } catch { /* ignore */ }
    return defaultRange()
}
const range = ref<[Date, Date] | null>(restoreRange())
watch(range, (r) => {
    try {
        if (!r) { localStorage.setItem(STORAGE_KEY, JSON.stringify({ all: true })); return }
        const today = new Date().toDateString()
        const endsToday = r[1].toDateString() === today
        const days = Math.round((new Date(r[1]).setHours(0, 0, 0, 0) - new Date(r[0]).setHours(0, 0, 0, 0)) / 86_400_000) + 1
        localStorage.setItem(STORAGE_KEY, JSON.stringify(endsToday ? { endsToday, days } : { from: r[0].toISOString(), to: r[1].toISOString() }))
    } catch { /* ignore */ }
})

const dfmt = (d: Date, withYear = false) =>
    d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).replace('.', '')
const periodLabel = computed(() => {
    const r = range.value
    if (!r) return 'за всё время'
    const sameDay = r[0].toDateString() === r[1].toDateString()
    const otherYear = r[0].getFullYear() !== new Date().getFullYear()
    if (sameDay) return r[0].toDateString() === new Date().toDateString() ? 'за сегодня' : `за ${dfmt(r[0], otherYear)}`
    return `${dfmt(r[0], otherYear)} — ${dfmt(r[1], otherYear)}`
})

/* ───────────── Данные ───────────── */
const recent = ref<Order[]>([])
const d = ref<DashboardData | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const err = ref<string | null>(null)

let seq = 0
async function fetchData() {
    const my = ++seq
    refreshing.value = true
    err.value = null
    const r = range.value
    try {
        const [o, data] = await Promise.all([
            Orders.list({ sort: 'createdAt:desc', populate: ['client'], 'pagination[pageSize]': 6 }),
            Settings.dashboard(r ? { from: r[0].toISOString(), to: r[1].toISOString() } : { all: '1' }),
        ])
        if (my !== seq) return
        recent.value = o
        d.value = data
        lastRefreshAt = Date.now()
    } catch (e: any) {
        if (my !== seq) return
        err.value = e?.response?.data?.error?.message || e?.message || 'Не удалось загрузить статистику'
    } finally {
        if (my === seq) { loading.value = false; refreshing.value = false }
    }
}
watch(range, fetchData)

/* Живое обновление по событиям заказов (не чаще раза в 30 с). */
const feed = useOrdersFeed()
let lastRefreshAt = 0
let pendingEvent = false
const THROTTLE_MS = 30_000
function scheduleRefresh() {
    if (document.visibilityState !== 'visible') { pendingEvent = true; return }
    const since = Date.now() - lastRefreshAt
    if (since < THROTTLE_MS) {
        pendingEvent = true
        setTimeout(() => { if (pendingEvent) { pendingEvent = false; fetchData() } }, THROTTLE_MS - since)
        return
    }
    pendingEvent = false
    fetchData()
}
function onVisible() { if (document.visibilityState === 'visible' && pendingEvent) { pendingEvent = false; fetchData() } }
const offs: Array<() => void> = []
onMounted(() => {
    fetchData()
    offs.push(feed.onCreated(scheduleRefresh))
    offs.push(feed.onUpdated(scheduleRefresh))
    document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
    for (const off of offs) try { off() } catch { /* noop */ }
    document.removeEventListener('visibilitychange', onVisible)
})

/* ───────────── Форматирование и сравнение ───────────── */
function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' сум'
}
function num(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v)
}

type Delta = { text: string; cls: string } | null
/** Изменение к прошлому периоду. `inverse` — когда рост это плохо (отмены). */
function delta(cur: number, prev: number | undefined, inverse = false): Delta {
    if (prev == null || !d.value?.previous) return null
    if (prev === 0 && cur === 0) return { text: 'без изменений', cls: 'text-ink-400' }
    if (prev === 0) return { text: 'новое', cls: inverse ? 'text-tomato-600' : 'text-olive-600' }
    const pct = Math.round(((cur - prev) / prev) * 100)
    if (pct === 0) return { text: '0%', cls: 'text-ink-400' }
    const up = pct > 0
    const good = inverse ? !up : up
    return { text: `${up ? '▲' : '▼'} ${Math.abs(pct)}%`, cls: good ? 'text-olive-600' : 'text-tomato-600' }
}

const kpis = computed(() => {
    const x = d.value
    if (!x) return []
    const p = x.previous
    const cancelShare = x.ordersCount + x.canceledCount
        ? Math.round((x.canceledCount / (x.ordersCount + x.canceledCount)) * 100) : 0
    return [
        { label: 'Заказов', value: num(x.ordersCount), delta: delta(x.ordersCount, p?.ordersCount), hint: 'без отменённых' },
        { label: 'Выручка', value: fmt(x.salesTotal), delta: delta(x.salesTotal, p?.salesTotal), hint: 'сумма заказов' },
        { label: 'Средний чек', value: fmt(x.avgCheck), delta: delta(x.avgCheck, p?.avgCheck), hint: '' },
        { label: 'Отмены', value: num(x.canceledCount), delta: delta(x.canceledCount, p?.canceledCount, true),
          hint: cancelShare ? `${cancelShare}% заказов` : '', danger: x.canceledCount > 0 },
        { label: 'Поступления', value: fmt(x.receiptsTotal), delta: delta(x.receiptsTotal, p?.receiptsTotal),
          hint: `+${fmt(x.paymentsSum)} / −${fmt(x.refundsSum)}` },
        { label: 'Новых клиентов', value: num(x.newClientsCount), delta: delta(x.newClientsCount, p?.newClientsCount), hint: '' },
    ]
})

const statusLabel: Record<string, string> = {
    new: 'Новый', accepted: 'Принят', in_progress: 'Готовим', done: 'Доставлен', canceled: 'Отменён',
}
const statusColor: Record<string, string> = {
    new: 'bg-saffron-300/20 text-saffron-500',
    accepted: 'bg-olive-500/15 text-olive-500',
    in_progress: 'bg-primary-100 text-primary-600',
    done: 'bg-olive-500/15 text-olive-500',
    canceled: 'bg-tomato-500/15 text-tomato-500',
}
function timeAgo(iso?: string) {
    if (!iso) return ''
    const dt = new Date(iso)
    const today = new Date().toDateString() === dt.toDateString()
    return today
        ? dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
</script>

<template>
    <AppTopbar title="Статистика" :subtitle="`Показатели ${periodLabel}`">
        <template #actions>
            <i v-if="refreshing && !loading" class="pi pi-spin pi-spinner text-ink-400 text-sm mr-1" aria-label="Обновляем"></i>
            <PeriodPicker v-model="range" :periods="PERIODS" />
        </template>
    </AppTopbar>

    <div class="p-8 space-y-8">
        <div v-if="err" class="bg-tomato-500/10 text-tomato-600 rounded-xl p-4 flex items-center justify-between gap-3">
            <span>{{ err }}</span>
            <button type="button" class="font-semibold underline" @click="fetchData">Повторить</button>
        </div>

        <!-- ───── Сейчас ───── -->
        <section>
            <div class="flex items-baseline gap-2 mb-3">
                <h2 class="font-display font-bold text-lg m-0">Сейчас</h2>
                <span class="text-xs text-ink-400">не зависит от периода</span>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-5">
                <RouterLink to="/requests" class="bg-white rounded-2xl p-5 no-underline text-inherit hover:ring-2 hover:ring-ink-100 transition">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Неназначенных заявок</div>
                    <div class="font-display font-extrabold text-3xl mt-2"
                         :class="(d?.unassignedRequestsCount ?? 0) > 0 ? 'text-tomato-500' : 'text-olive-500'">
                        {{ loading ? '…' : d?.unassignedRequestsCount ?? 0 }}
                    </div>
                </RouterLink>
                <RouterLink to="/orders" class="bg-white rounded-2xl p-5 no-underline text-inherit hover:ring-2 hover:ring-ink-100 transition">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Активных заказов</div>
                    <div class="font-display font-extrabold text-3xl mt-2">{{ loading ? '…' : d?.activeOrdersCount ?? 0 }}</div>
                    <div class="text-[11px] text-ink-400 mt-0.5">новые, принятые и в работе</div>
                </RouterLink>
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Клиентов в базе</div>
                    <div class="font-display font-extrabold text-3xl mt-2">{{ loading ? '…' : num(d?.clientsCount ?? 0) }}</div>
                </div>
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Блюд в каталоге</div>
                    <div class="font-display font-extrabold text-3xl mt-2">{{ loading ? '…' : d?.productsCount ?? 0 }}</div>
                </div>
            </div>
        </section>

        <!-- ───── За период ───── -->
        <section :class="refreshing && !loading ? 'opacity-60 transition-opacity' : 'transition-opacity'">
            <div class="flex items-baseline gap-2 mb-3 flex-wrap">
                <h2 class="font-display font-bold text-lg m-0">Продажи {{ periodLabel }}</h2>
                <span v-if="d?.previous" class="text-xs text-ink-400">стрелки — сравнение с предыдущим таким же периодом</span>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-5">
                <div v-for="k in kpis" :key="k.label" class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">{{ k.label }}</div>
                    <div class="font-display font-extrabold text-2xl mt-2 truncate" :class="(k as any).danger ? 'text-tomato-500' : ''"
                         :title="k.value">{{ k.value }}</div>
                    <div class="flex items-center gap-2 mt-1 text-[11px] min-h-[16px]">
                        <span v-if="k.delta" class="font-bold" :class="k.delta.cls">{{ k.delta.text }}</span>
                        <span v-if="k.hint" class="text-ink-400 truncate">{{ k.hint }}</span>
                    </div>
                </div>
                <template v-if="loading">
                    <div v-for="i in 6" :key="'s' + i" class="bg-white rounded-2xl p-5 h-[112px] animate-pulse"></div>
                </template>
            </div>
        </section>

        <!-- ───── Хиты + заявки ───── -->
        <div class="grid lg:grid-cols-2 gap-6" :class="refreshing && !loading ? 'opacity-60' : ''">
            <section class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold text-lg">Хиты продаж</div>
                <div class="text-xs text-ink-400 mb-4">{{ periodLabel }}, без отменённых заказов</div>
                <div v-if="!d?.topProducts?.length" class="text-sm text-ink-400 py-6 text-center">За этот период продаж нет.</div>
                <div v-else class="space-y-3">
                    <div v-for="(p, idx) in d.topProducts" :key="p.productId ?? p.name" class="flex items-center gap-3">
                        <div class="size-9 rounded-lg bg-ink-900 text-cream-50 flex items-center justify-center text-sm font-bold shrink-0">{{ idx + 1 }}</div>
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold truncate">{{ p.name }}</div>
                            <div class="text-xs text-ink-400">{{ num(p.sold) }} шт. · {{ fmt(p.revenue) }}</div>
                        </div>
                        <div class="w-32 bg-ink-100 rounded-full h-2 overflow-hidden shrink-0">
                            <div class="h-full bg-tomato-500" :style="{ width: `${Math.min(100, (p.sold / d.topProducts[0].sold) * 100)}%` }"></div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="bg-white rounded-2xl p-6">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <div class="font-display font-bold text-lg">Заявки</div>
                        <div class="text-xs text-ink-400">{{ periodLabel }}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-[11px] font-bold uppercase tracking-wider text-ink-400">Среднее до принятия</div>
                        <div class="font-display font-extrabold text-2xl">
                            {{ d?.avgTimeToAcceptMinutes ?? 0 }} <span class="text-sm font-normal text-ink-400">мин</span>
                        </div>
                    </div>
                </div>
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mt-5 mb-3">Конверсия по сотрудникам</div>
                <div v-if="!d?.conversionByEmployee?.length" class="text-sm text-ink-400 py-4 text-center">За этот период заявок нет.</div>
                <div v-else class="space-y-3">
                    <div v-for="e in d.conversionByEmployee" :key="e.id" class="flex items-center gap-3">
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold truncate">{{ e.name }}</div>
                            <div class="text-xs text-ink-400">{{ e.converted }} из {{ e.requests }} в заказ</div>
                        </div>
                        <div class="w-32 bg-ink-100 rounded-full h-2 overflow-hidden shrink-0">
                            <div class="h-full bg-tomato-500" :style="{ width: `${e.rate}%` }"></div>
                        </div>
                        <div class="w-10 text-right text-xs font-semibold">{{ e.rate }}%</div>
                    </div>
                </div>
            </section>
        </div>

        <!-- ───── География ───── -->
        <OrdersGeo :range="range" :period-label="periodLabel" />

        <!-- ───── Последние заказы ───── -->
        <section class="bg-white rounded-2xl p-6">
            <div class="flex items-baseline justify-between mb-4">
                <div class="font-display font-bold text-lg">Последние заказы</div>
                <RouterLink to="/orders" class="text-sm font-semibold text-tomato-600 no-underline">Все заказы →</RouterLink>
            </div>
            <div v-if="!recent.length" class="text-sm text-ink-400">Пока нет заказов.</div>
            <div v-else class="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                <div v-for="o in recent" :key="o.id" class="flex items-center gap-3 rounded-xl bg-ink-50 px-3 py-2.5">
                    <div class="size-10 rounded-lg bg-white flex items-center justify-center text-xs font-bold shrink-0">{{ o.code.slice(-4) }}</div>
                    <div class="flex-1 min-w-0">
                        <div class="font-semibold truncate">{{ o.client?.fullName || '—' }}</div>
                        <div class="text-xs text-ink-400">{{ fmt(Number(o.total)) }} · {{ timeAgo((o as any).createdAt) }}</div>
                    </div>
                    <span class="rounded-full px-3 py-1 text-xs font-semibold shrink-0" :class="statusColor[o.status]">{{ statusLabel[o.status] }}</span>
                </div>
            </div>
        </section>
    </div>
</template>
