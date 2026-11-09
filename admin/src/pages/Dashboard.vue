<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { Clients, Orders, Products, type DashboardData, type Order, type Product } from '@/services/resources'
import { Settings } from '@/services/settings'
import { useOrdersFeed } from '@/stores/ordersFeed'

const orders = ref<Order[]>([])
const products = ref<Product[]>([])
const clientsCount = ref(0)
const dashboardData = ref<DashboardData | null>(null)
const loading = ref(true)
const err = ref<string | null>(null)

const feed = useOrdersFeed()
let lastRefreshAt = 0
let pendingEvent = false
const THROTTLE_MS = 30_000

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

async function fetchData() {
    try {
        const [o, p, c, d] = await Promise.all([
            Orders.list({ sort: 'createdAt:desc', populate: ['items'] }),
            Products.list({ sort: 'id:asc' }),
            Clients.list({ 'pagination[pageSize]': 1 }),
            Settings.dashboard().catch(() => null),
        ])
        orders.value = o
        products.value = p
        clientsCount.value = c.length
        dashboardData.value = d
        lastRefreshAt = Date.now()
    } catch (e: any) {
        err.value = e?.message || 'Не удалось загрузить статистику'
    } finally {
        loading.value = false
    }
}

function scheduleRefresh() {
    if (document.visibilityState !== 'visible') { pendingEvent = true; return }
    const since = Date.now() - lastRefreshAt
    if (since < THROTTLE_MS) {
        pendingEvent = true
        setTimeout(() => {
            if (pendingEvent) { pendingEvent = false; fetchData() }
        }, THROTTLE_MS - since)
        return
    }
    pendingEvent = false
    fetchData()
}

const offs: Array<() => void> = []
onMounted(() => {
    fetchData()
    offs.push(feed.onCreated(scheduleRefresh))
    offs.push(feed.onUpdated(scheduleRefresh))
})
onBeforeUnmount(() => {
    for (const off of offs) try { off() } catch { /* noop */ }
})

const stats = computed(() => {
    const o = orders.value
    const todayOrders = o.length
    const revenue = o
        .filter((x) => x.status !== 'canceled')
        .reduce((s, x) => s + Number(x.total || 0), 0)
    const avg = Math.round(revenue / Math.max(1, todayOrders))
    const canceled = o.filter((x) => x.status === 'canceled').length
    return { todayOrders, revenue, avg, canceled }
})

const recent = computed(() => orders.value.slice(0, 5))

/** Группируем продажи по продуктам из line items. */
const topProducts = computed(() => {
    const bySlug: Record<string, { product: Product; sold: number; revenue: number }> = {}
    for (const o of orders.value) {
        if (o.status === 'canceled') continue
        for (const it of o.items || []) {
            const key = it.product?.slug ?? it.name
            const prod = it.product ?? ({ id: 0, name: it.name, slug: key } as Product)
            bySlug[key] = bySlug[key] || { product: prod, sold: 0, revenue: 0 }
            bySlug[key].sold += it.qty
            bySlug[key].revenue += Number(it.price || 0) * it.qty
        }
    }
    return Object.values(bySlug).sort((a, b) => b.sold - a.sold).slice(0, 5)
})

const statusLabel: Record<string, string> = {
    new: 'Новый', accepted: 'Принят', cooking: 'Готовится',
    delivering: 'В пути', done: 'Доставлен', canceled: 'Отменён',
}
const statusColor: Record<string, string> = {
    new: 'bg-saffron-300/20 text-saffron-500',
    accepted: 'bg-olive-500/15 text-olive-500',
    cooking: 'bg-saffron-300/20 text-saffron-500',
    delivering: 'bg-primary-100 text-primary-600',
    done: 'bg-olive-500/15 text-olive-500',
    canceled: 'bg-tomato-500/15 text-tomato-500',
}
</script>

<template>
    <AppTopbar title="Статистика" subtitle="Пульс продаж — все заказы из Strapi" />

    <div class="p-8 space-y-8">
        <div v-if="err" class="bg-tomato-500/10 text-tomato-600 rounded-xl p-4">{{ err }}</div>

        <!-- Контроль за неделю (Фаза 5) -->
        <div v-if="dashboardData" class="space-y-5">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-5">
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Неназначенных заявок</div>
                    <div class="font-display font-extrabold text-3xl mt-2"
                         :class="dashboardData.unassignedRequestsCount > 0 ? 'text-tomato-500' : 'text-olive-500'">
                        {{ dashboardData.unassignedRequestsCount }}
                    </div>
                </div>
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Среднее до принятия</div>
                    <div class="font-display font-extrabold text-3xl mt-2">
                        {{ dashboardData.avgTimeToAcceptMinutes }} <span class="text-base font-normal text-ink-400">мин</span>
                    </div>
                </div>
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Продажи (по заказам)</div>
                    <div class="font-display font-extrabold text-2xl mt-2">{{ fmt(dashboardData.salesTotal) }}</div>
                </div>
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Поступления (по транзакциям)</div>
                    <div class="font-display font-extrabold text-2xl mt-2">{{ fmt(dashboardData.receiptsTotal) }}</div>
                    <div class="text-[11px] text-ink-400 mt-0.5">
                        +{{ fmt(dashboardData.paymentsSum) }} / −{{ fmt(dashboardData.refundsSum) }}
                    </div>
                </div>
            </div>

            <div class="grid lg:grid-cols-2 gap-5">
                <div class="bg-white rounded-2xl p-6">
                    <div class="font-display font-bold text-lg mb-4">Конверсия заявок по типам</div>
                    <div class="space-y-3">
                        <div v-for="(b, key) in dashboardData.conversionByType" :key="key" class="flex items-center gap-3">
                            <div class="w-24 text-sm font-semibold">{{ key === 'shop' ? 'Магазины' : 'Физлица' }}</div>
                            <div class="flex-1 bg-ink-100 rounded-full h-2 overflow-hidden">
                                <div class="h-full bg-olive-500" :style="{ width: `${b.rate}%` }"></div>
                            </div>
                            <div class="w-28 text-right text-xs text-ink-400">
                                {{ b.converted }} / {{ b.requests }} · {{ b.rate }}%
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-2xl p-6">
                    <div class="font-display font-bold text-lg mb-4">Конверсия по сотрудникам</div>
                    <div v-if="!dashboardData.conversionByEmployee.length" class="text-sm text-ink-400">
                        Пока нет данных за период.
                    </div>
                    <div v-else class="space-y-3">
                        <div v-for="e in dashboardData.conversionByEmployee" :key="e.id" class="flex items-center gap-3">
                            <div class="flex-1 min-w-0">
                                <div class="font-semibold truncate">{{ e.name }}</div>
                                <div class="text-xs text-ink-400">{{ e.converted }} из {{ e.requests }}</div>
                            </div>
                            <div class="w-40 bg-ink-100 rounded-full h-2 overflow-hidden">
                                <div class="h-full bg-tomato-500" :style="{ width: `${e.rate}%` }"></div>
                            </div>
                            <div class="w-10 text-right text-xs font-semibold">{{ e.rate }}%</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- KPI -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <div class="bg-white rounded-2xl p-5">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Заказов всего</div>
                <div class="font-display font-extrabold text-3xl mt-2">
                    {{ loading ? '…' : stats.todayOrders }}
                </div>
            </div>
            <div class="bg-white rounded-2xl p-5">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Выручка</div>
                <div class="font-display font-extrabold text-3xl mt-2">
                    {{ loading ? '…' : fmt(stats.revenue) }}
                </div>
            </div>
            <div class="bg-white rounded-2xl p-5">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Средний чек</div>
                <div class="font-display font-extrabold text-3xl mt-2">
                    {{ loading ? '…' : fmt(stats.avg) }}
                </div>
            </div>
            <div class="bg-white rounded-2xl p-5">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Отмены</div>
                <div class="font-display font-extrabold text-3xl mt-2 text-tomato-500">
                    {{ loading ? '…' : stats.canceled }}
                </div>
            </div>
        </div>

        <!-- Top + Recent -->
        <div class="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6">
            <div class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold text-lg mb-4">Хиты продаж</div>
                <div v-if="!topProducts.length" class="text-sm text-ink-400">
                    Пока нет данных.
                </div>
                <div v-else class="space-y-3">
                    <div v-for="(p, idx) in topProducts" :key="p.product.id || idx" class="flex items-center gap-3">
                        <div class="size-9 rounded-lg bg-ink-900 text-cream-50 flex items-center justify-center text-sm font-bold">
                            {{ idx + 1 }}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold truncate">{{ p.product.name }}</div>
                            <div class="text-xs text-ink-400">{{ p.sold }} шт. · {{ fmt(p.revenue) }}</div>
                        </div>
                        <div class="w-40 bg-ink-100 rounded-full h-2 overflow-hidden">
                            <div class="h-full bg-tomato-500"
                                 :style="{ width: `${Math.min(100, (p.sold / topProducts[0].sold) * 100)}%` }"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold text-lg mb-4">Последние заказы</div>
                <div v-if="!recent.length" class="text-sm text-ink-400">
                    Пока нет заказов.
                </div>
                <div v-else class="space-y-3">
                    <div v-for="o in recent" :key="o.id" class="flex items-center gap-3">
                        <div class="size-10 rounded-lg bg-ink-50 flex items-center justify-center text-xs font-bold">
                            {{ o.code.slice(-4) }}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold truncate">{{ o.client?.fullName || '—' }}</div>
                            <div class="text-xs text-ink-400">{{ fmt(Number(o.total)) }}</div>
                        </div>
                        <span class="rounded-full px-3 py-1 text-xs font-semibold"
                              :class="statusColor[o.status]">
                            {{ statusLabel[o.status] }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-3 gap-5">
            <div class="bg-white rounded-2xl p-5">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Клиентов в базе</div>
                <div class="font-display font-extrabold text-2xl mt-2">{{ loading ? '…' : clientsCount }}</div>
            </div>
            <div class="bg-white rounded-2xl p-5">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Продуктов в каталоге</div>
                <div class="font-display font-extrabold text-2xl mt-2">{{ loading ? '…' : products.length }}</div>
            </div>
            <div class="bg-white rounded-2xl p-5">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Активных заказов</div>
                <div class="font-display font-extrabold text-2xl mt-2">
                    {{ loading ? '…' : orders.filter((o) => !['done','canceled'].includes(o.status)).length }}
                </div>
            </div>
        </div>
    </div>
</template>
