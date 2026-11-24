<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import {
    courierListOrders, courierAcceptOrder, courierConfirmOrder,
    type Order,
} from '@/services/resources'
import { mediaUrl } from '@/services/api'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const router = useRouter()
const toast = useToast()

type Tab = 'new' | 'in_progress' | 'done'
const tab = ref<Tab>('new')
const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'new',         label: 'Новые' },
    { key: 'in_progress', label: 'В процессе' },
    { key: 'done',        label: 'Доставленные' },
]

const lists = ref<Record<Tab, Order[]>>({ new: [], in_progress: [], done: [] })
const totals = ref<Record<Tab, number>>({ new: 0, in_progress: 0, done: 0 })
const loading = ref(false)
const selected = ref<Order | null>(null)
const acting = ref(false)

async function loadTab(t: Tab) {
    loading.value = true
    try {
        // Для «Новые» грузим также accepted — назначенные, но не взятые ещё в работу.
        const r1 = await courierListOrders(t === 'new' ? 'new' : t)
        if (t === 'new') {
            const r2 = await courierListOrders('accepted')
            lists.value[t] = [...r2.data, ...r1.data]
            totals.value[t] = r1.total + r2.total
        } else {
            lists.value[t] = r1.data
            totals.value[t] = r1.total
        }
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.message, life: 2500 })
    } finally {
        loading.value = false
    }
}

async function loadAll() {
    await Promise.all([loadTab('new'), loadTab('in_progress'), loadTab('done')])
}

function pickTab(t: Tab) {
    tab.value = t
    loadTab(t)
}

function openOrder(o: Order) {
    // На «Доставленные» деталей нет — только список.
    if (o.status === 'done') return
    selected.value = o
}

async function accept() {
    if (!selected.value) return
    acting.value = true
    try {
        await courierAcceptOrder(selected.value.documentId)
        toast.add({ severity: 'success', summary: 'Принят в работу', life: 1500 })
        selected.value = null
        await Promise.all([loadTab('new'), loadTab('in_progress')])
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 2500 })
    } finally {
        acting.value = false
    }
}

async function confirm() {
    if (!selected.value) return
    acting.value = true
    try {
        await courierConfirmOrder(selected.value.documentId)
        toast.add({ severity: 'success', summary: 'Доставка подтверждена', life: 1500 })
        selected.value = null
        await Promise.all([loadTab('in_progress'), loadTab('done')])
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 2500 })
    } finally {
        acting.value = false
    }
}

function fmtSum(v: number | null | undefined) {
    return new Intl.NumberFormat('ru-RU').format(Number(v || 0)) + ' сум'
}
function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtDateFull(iso: string) {
    return new Date(iso).toLocaleString('ru-RU')
}

const avatar = computed(() => {
    const e = auth.employee as any
    return e?.photo?.url ? mediaUrl(e.photo.url) : ''
})
const initials = computed(() =>
    (auth.employee?.fullName || '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '—',
)

/** Единая ссылка на карту. iOS/Android подхватят нативным "Открыть в…". */
function mapHref(o: Order): string {
    if (o.lat && o.lng) return `geo:${o.lat},${o.lng}?q=${o.lat},${o.lng}`
    if (o.address) return `geo:0,0?q=${encodeURIComponent(o.address)}`
    return '#'
}

// --- Авто-обновление: polling каждые 30с, пока вкладка видима ---
let pollTimer: number | null = null
function startPolling() {
    stopPolling()
    pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') loadTab(tab.value)
    }, 30000)
}
function stopPolling() {
    if (pollTimer != null) { clearInterval(pollTimer); pollTimer = null }
}

onMounted(() => { loadAll(); startPolling() })
onUnmounted(stopPolling)

function logout() {
    auth.logout()
    router.push('/login')
}
</script>

<template>
    <div class="min-h-screen bg-ink-50 text-ink-900 flex flex-col">
        <!-- HEADER -->
        <header class="sticky top-0 z-10 bg-white border-b border-ink-100 px-4 py-3 flex items-center gap-3">
            <div class="shrink-0">
                <img v-if="avatar" :src="avatar" alt="" class="size-10 rounded-full object-cover" />
                <div v-else class="size-10 rounded-full bg-ink-900 text-cream-50 flex items-center justify-center font-bold text-sm">
                    {{ initials }}
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="font-display font-bold text-base leading-tight truncate">{{ auth.employee?.fullName }}</div>
                <div class="text-xs text-ink-400">Курьер</div>
            </div>
            <button type="button" class="size-11 rounded-full bg-ink-100 flex items-center justify-center text-ink-600"
                    @click="logout" title="Выйти">
                <i class="pi pi-sign-out" />
            </button>
        </header>

        <!-- TABS -->
        <nav class="sticky top-[65px] z-10 bg-ink-50 px-3 py-2 flex gap-2">
            <button v-for="t in tabs" :key="t.key" type="button"
                    class="flex-1 rounded-xl py-3 text-sm font-bold border transition min-h-[48px]"
                    :class="tab === t.key ? 'bg-ink-900 text-cream-50 border-ink-900' : 'bg-white border-ink-200 text-ink-700'"
                    @click="pickTab(t.key)">
                {{ t.label }}
                <span v-if="totals[t.key] > 0" class="ml-1 opacity-75">({{ totals[t.key] }})</span>
            </button>
        </nav>

        <!-- LIST -->
        <main class="flex-1 px-3 pt-2 pb-6 space-y-3">
            <div v-if="loading && !lists[tab].length" class="text-center text-ink-400 py-10">Загрузка…</div>

            <div v-else-if="!lists[tab].length" class="text-center text-ink-400 py-16">
                <i class="pi pi-inbox text-3xl block mb-3 opacity-50" />
                <template v-if="tab === 'new'">Нет новых заказов.</template>
                <template v-else-if="tab === 'in_progress'">Нет заказов в процессе.</template>
                <template v-else>Доставленных заказов пока нет.</template>
            </div>

            <!-- Доставленные: только номер + дата, без клика -->
            <template v-else-if="tab === 'done'">
                <div v-for="o in lists[tab]" :key="o.id"
                     class="bg-white rounded-2xl p-4 flex items-center justify-between">
                    <div>
                        <div class="font-display font-bold">{{ o.code }}</div>
                        <div class="text-xs text-ink-400 mt-0.5">{{ fmtDateFull(o.createdAt) }}</div>
                    </div>
                    <i class="pi pi-check-circle text-emerald-500 text-lg" />
                </div>
            </template>

            <!-- Новые / В процессе: карточки с действием -->
            <template v-else>
                <button v-for="o in lists[tab]" :key="o.id" type="button"
                        class="w-full text-left bg-white rounded-2xl p-4 active:scale-[0.99] transition border border-transparent active:border-ink-200"
                        @click="openOrder(o)">
                    <div class="flex items-center justify-between gap-2">
                        <div class="font-display font-bold">{{ o.code }}</div>
                        <div class="text-sm font-bold text-ink-900">{{ fmtSum(o.total) }}</div>
                    </div>
                    <div class="mt-1 text-sm text-ink-600 truncate">{{ o.address || '—' }}</div>
                    <div class="mt-1 text-xs text-ink-400">{{ fmtDate(o.createdAt) }}</div>
                    <div v-if="o.status === 'in_progress'"
                         class="mt-2 inline-flex items-center gap-1 text-xs font-bold text-saffron-500">
                        <i class="pi pi-truck" /> В пути
                    </div>
                </button>
            </template>
        </main>

        <!-- DETAIL DIALOG -->
        <Dialog v-model:visible="selected as any" modal :closable="true" :draggable="false" dismissable-mask
                :header="selected?.code" :pt="{ root: { class: 'rounded-2xl', style: 'width: 92vw; max-width: 460px' } }">
            <div v-if="selected" class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div class="rounded-xl bg-ink-50 p-3">
                        <div class="text-xs text-ink-400 font-bold uppercase">Сумма</div>
                        <div class="font-display font-bold text-xl mt-0.5">{{ fmtSum(selected.total) }}</div>
                    </div>
                    <div class="rounded-xl bg-ink-50 p-3">
                        <div class="text-xs text-ink-400 font-bold uppercase">Оплата</div>
                        <div class="font-semibold text-sm mt-0.5">
                            {{ selected.paymentStatus === 'paid' ? 'Оплачен' : 'Не оплачен' }}
                        </div>
                    </div>
                </div>

                <div class="rounded-xl bg-ink-50 p-3">
                    <div class="text-xs text-ink-400 font-bold uppercase mb-1">Клиент</div>
                    <div class="font-semibold">{{ selected.client?.fullName || '—' }}</div>
                    <a v-if="selected.client?.phone" :href="`tel:${selected.client.phone}`"
                       class="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-ink-900 no-underline">
                        <i class="pi pi-phone" />{{ selected.client.phone }}
                    </a>
                </div>

                <div class="rounded-xl bg-ink-50 p-3">
                    <div class="text-xs text-ink-400 font-bold uppercase mb-1">Адрес</div>
                    <div class="text-sm">{{ selected.address || '—' }}</div>
                    <a v-if="mapHref(selected) !== '#'" :href="mapHref(selected)"
                       target="_blank" rel="noopener"
                       class="mt-2 inline-flex items-center gap-2 bg-ink-900 text-cream-50 rounded-xl px-4 py-2.5 text-sm font-bold no-underline">
                        <i class="pi pi-map-marker" /> Открыть маршрут
                    </a>
                </div>

                <div v-if="selected.items?.length" class="rounded-xl bg-ink-50 p-3">
                    <div class="text-xs text-ink-400 font-bold uppercase mb-2">Состав</div>
                    <ul class="space-y-1 text-sm">
                        <li v-for="(it, i) in selected.items" :key="i" class="flex justify-between gap-2">
                            <span class="min-w-0 truncate">{{ it.name }}</span>
                            <span class="shrink-0 text-ink-500">× {{ it.qty }}</span>
                        </li>
                    </ul>
                </div>

                <div v-if="selected.comment" class="rounded-xl bg-saffron-300/20 p-3">
                    <div class="text-xs text-saffron-500 font-bold uppercase mb-1">Комментарий</div>
                    <div class="text-sm">{{ selected.comment }}</div>
                </div>
            </div>

            <template #footer>
                <Button v-if="selected && ['new','accepted'].includes(selected.status)"
                        label="Принять в работу" icon="pi pi-check"
                        severity="primary" class="w-full"
                        :loading="acting" @click="accept" />
                <Button v-else-if="selected && selected.status === 'in_progress'"
                        label="Подтвердить доставку" icon="pi pi-check-circle"
                        severity="primary" class="w-full"
                        :loading="acting" @click="confirm" />
            </template>
        </Dialog>
    </div>
</template>
