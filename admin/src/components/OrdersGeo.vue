<!-- География заказов за период: точки на Яндекс.Карте с кластерами + таблица по районам. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api, qs } from '@/services/api'
import { loadYmaps, TASHKENT } from '@/services/ymaps'
import { UNKNOWN_DISTRICT, districtFromText } from '@/services/districts'

const props = defineProps<{
    /** Диапазон периода или null — «всё время». */
    range: [Date, Date] | null
    periodLabel: string
}>()

interface GeoOrder {
    id: number; documentId: string; code: string; status: string; total: number
    lat: number | null; lng: number | null; address: string | null; createdAt: string
    /** Район с сервера: null — ещё не определяли, '' — определяли, не нашли. */
    district: string | null
}

const orders = ref<GeoOrder[]>([])
const loading = ref(true)
const err = ref<string | null>(null)
const truncated = ref(false)
const view = ref<'map' | 'table'>('map')
const selected = ref<string | null>(null)
const geoState = ref<{ running: boolean; left: number; error: string | null; configured: boolean }>({
    running: false, left: 0, error: null, configured: true,
})
const mapError = ref<string | null>(null)

/* ───── Загрузка ───── */
let seq = 0
async function load() {
    const my = ++seq
    loading.value = true
    err.value = null
    try {
        const r = props.range
        const params = r ? { from: r[0].toISOString(), to: r[1].toISOString() } : { all: '1' }
        const res = await api.get('/staff/orders-geo' + qs(params))
        if (my !== seq) return
        orders.value = (res.data?.data ?? []) as GeoOrder[]
        const meta = res.data?.meta || {}
        truncated.value = Boolean(meta.truncated)
        geoState.value.configured = meta.geocoder !== false
        geoState.value.left = Number(meta.unresolved || 0)
        selected.value = selected.value && districtNames.value.includes(selected.value) ? selected.value : null
        await nextTick()
        renderPoints(true)
        if (geoState.value.left > 0) backfill()
    } catch (e: any) {
        if (my !== seq) return
        err.value = e?.response?.data?.error?.message || e?.message || 'Не удалось загрузить заказы'
    } finally {
        if (my === seq) loading.value = false
    }
}
watch(() => props.range, load)

/* ───── Районы ───── */
function districtOf(o: GeoOrder): string {
    return o.district || districtFromText(o.address) || UNKNOWN_DISTRICT
}

const withDistrict = computed(() => orders.value.map((o) => ({ ...o, district: districtOf(o) })))
const onMap = computed(() => withDistrict.value.filter((o) => o.lat != null && o.lng != null))
const noCoords = computed(() => orders.value.length - onMap.value.length)

type SortKey = 'count' | 'revenue' | 'avg' | 'name'
const sortKey = ref<SortKey>('count')
const rows = computed(() => {
    const acc = new Map<string, { name: string; count: number; revenue: number }>()
    for (const o of withDistrict.value) {
        const r = acc.get(o.district) ?? { name: o.district, count: 0, revenue: 0 }
        r.count++
        r.revenue += o.total
        acc.set(o.district, r)
    }
    const total = orders.value.length || 1
    const revenueTotal = withDistrict.value.reduce((s, o) => s + o.total, 0) || 1
    const list = [...acc.values()].map((r) => ({
        ...r,
        avg: r.count ? Math.round(r.revenue / r.count) : 0,
        share: Math.round((r.count / total) * 1000) / 10,
        revenueShare: Math.round((r.revenue / revenueTotal) * 1000) / 10,
        unknown: r.name === UNKNOWN_DISTRICT,
    }))
    const by: Record<SortKey, (a: any, b: any) => number> = {
        count: (a, b) => b.count - a.count || b.revenue - a.revenue,
        revenue: (a, b) => b.revenue - a.revenue,
        avg: (a, b) => b.avg - a.avg,
        name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    }
    // «Не определён» всегда внизу — это не район.
    return list.sort((a, b) => Number(a.unknown) - Number(b.unknown) || by[sortKey.value](a, b))
})
const districtNames = computed(() => rows.value.map((r) => r.name))
const maxCount = computed(() => Math.max(1, ...rows.value.filter((r) => !r.unknown).map((r) => r.count)))
const totals = computed(() => ({
    count: orders.value.length,
    revenue: orders.value.reduce((s, o) => s + o.total, 0),
    districts: rows.value.filter((r) => !r.unknown).length,
}))

/** Старые заказы без района: сервер определяет их порциями через геокодер Яндекса.
 *  Один раз за открытие страницы, до 10 порций; потом перечитываем данные. */
let backfillTried = false
async function backfill() {
    if (backfillTried || geoState.value.running || !geoState.value.configured) return
    backfillTried = true
    geoState.value.running = true
    geoState.value.error = null
    let changed = 0
    try {
        for (let i = 0; i < 10; i++) {
            const res = await api.post('/staff/orders-geo/resolve', { batch: 40 })
            const r = res.data?.data || {}
            changed += Number(r.processed || 0)
            geoState.value.left = Number(r.left || 0)
            geoState.value.configured = r.geocoder !== false
            if (r.error) { geoState.value.error = r.error; break }
            if (!r.processed || !r.left) break
        }
    } catch (e: any) {
        geoState.value.error = e?.response?.data?.error?.message || e?.message || 'ошибка'
    } finally {
        geoState.value.running = false
    }
    if (changed) load()
}

/* ───── Карта ───── */
const mapEl = ref<HTMLDivElement | null>(null)
let map: any = null
let manager: any = null

function esc(s: unknown) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
const STATUS: Record<string, string> = { new: 'Новый', accepted: 'Принят', in_progress: 'Готовим', done: 'Доставлен', canceled: 'Отменён' }

async function initMap() {
    if (map || !mapEl.value) return
    try {
        const ymaps = await loadYmaps()
        if (!mapEl.value) return
        map = new ymaps.Map(mapEl.value, { center: TASHKENT, zoom: 11, controls: ['zoomControl', 'fullscreenControl'] },
            { suppressMapOpenBlock: true })
        manager = new ymaps.ObjectManager({ clusterize: true, gridSize: 64, clusterDisableClickZoom: false })
        manager.objects.options.set('preset', 'islands#redCircleDotIcon')
        manager.clusters.options.set('preset', 'islands#redClusterIcons')
        map.geoObjects.add(manager)
        renderPoints(true)
    } catch {
        mapError.value = 'Не удалось загрузить Яндекс.Карты. Проверьте интернет и VITE_YANDEX_MAPS_KEY.'
    }
}

function renderPoints(fit: boolean) {
    if (!manager) return
    manager.removeAll()
    manager.add({
        type: 'FeatureCollection',
        features: onMap.value.map((o) => ({
            type: 'Feature',
            id: o.id,
            geometry: { type: 'Point', coordinates: [o.lat, o.lng] },
            properties: {
                district: o.district,
                hintContent: `${esc(o.code)} · ${esc(fmt(o.total))}`,
                balloonContentHeader: `<a href="/orders/${o.id}">${esc(o.code)}</a> · ${esc(STATUS[o.status] || o.status)}`,
                balloonContentBody: `<div style="font-size:13px;line-height:1.45">
                    <b>${esc(fmt(o.total))}</b><br>${esc(o.address || 'Адрес не указан')}<br>
                    <span style="color:#707070">${esc(o.district)} · ${esc(new Date(o.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span></div>`,
                clusterCaption: esc(o.code),
            },
        })),
    })
    applyFilter(fit)
}

function applyFilter(fit: boolean) {
    if (!manager) return
    const sel = selected.value
    manager.setFilter(sel ? (obj: any) => obj.properties.district === sel : () => true)
    if (!fit) return
    const pts = onMap.value.filter((o) => !sel || o.district === sel)
    if (!pts.length) { map.setCenter(TASHKENT, 11); return }
    if (pts.length === 1) { map.setCenter([pts[0].lat, pts[0].lng], 15); return }
    const lats = pts.map((p) => p.lat!), lngs = pts.map((p) => p.lng!)
    map.setBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
        { checkZoomRange: true, zoomMargin: 40 })
}

function pick(name: string | null) {
    selected.value = selected.value === name ? null : name
    if (view.value !== 'map') view.value = 'map'
    nextTick(() => applyFilter(true))
}

watch(view, async (v) => {
    if (v !== 'map') return
    await nextTick()
    if (!map) initMap()
    else map.container.fitToViewport()
})

onMounted(() => {
    load()
    initMap()
})
onBeforeUnmount(() => {
    try { map?.destroy() } catch { /* noop */ }
    map = null
    manager = null
})

/* ───── Формат ───── */
function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' сум' }
function num(v: number) { return new Intl.NumberFormat('ru-RU').format(v) }
const SORTS: Array<{ key: SortKey; label: string }> = [
    { key: 'name', label: 'Район' }, { key: 'count', label: 'Заказов' },
    { key: 'revenue', label: 'Выручка' }, { key: 'avg', label: 'Средний чек' },
]
</script>

<template>
    <section class="bg-white rounded-2xl p-6">
        <div class="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
                <div class="font-display font-bold text-lg">Заказы по районам</div>
                <div class="text-xs text-ink-400">
                    {{ periodLabel }}, без отменённых
                    <template v-if="!loading"> · {{ num(totals.count) }} заказов · {{ fmt(totals.revenue) }} · районов: {{ totals.districts }}</template>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <div class="inline-flex p-1 rounded-[10px] bg-ink-100" role="tablist" aria-label="Вид">
                    <button type="button" role="tab" :aria-selected="view === 'map'" @click="view = 'map'"
                            class="px-3.5 py-2 rounded-[7px] text-xs font-bold transition flex items-center gap-1.5"
                            :class="view === 'map' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'">
                        <i class="pi pi-map-marker text-[11px]"></i>Карта
                    </button>
                    <button type="button" role="tab" :aria-selected="view === 'table'" @click="view = 'table'"
                            class="px-3.5 py-2 rounded-[7px] text-xs font-bold transition flex items-center gap-1.5"
                            :class="view === 'table' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'">
                        <i class="pi pi-table text-[11px]"></i>Таблица
                    </button>
                </div>
            </div>
        </div>

        <div v-if="err" class="bg-tomato-500/10 text-tomato-600 rounded-xl p-4 text-sm mb-4 flex justify-between gap-3">
            <span>{{ err }}</span><button type="button" class="font-semibold underline" @click="load">Повторить</button>
        </div>

        <!-- Карта -->
        <div v-show="view === 'map'" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div class="relative rounded-xl overflow-hidden bg-ink-50 min-h-[460px]">
                <div ref="mapEl" class="absolute inset-0"></div>
                <div v-if="mapError" class="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-tomato-600">{{ mapError }}</div>
                <div v-else-if="loading" class="absolute inset-0 flex items-center justify-center bg-white/60 text-ink-500 text-sm">
                    <i class="pi pi-spin pi-spinner mr-2"></i>Загружаем заказы…
                </div>
                <div v-else-if="!onMap.length" class="absolute inset-x-0 top-4 flex justify-center pointer-events-none">
                    <span class="bg-white rounded-full px-4 py-2 text-sm text-ink-500 shadow">За период нет заказов с точкой на карте</span>
                </div>
                <div v-if="selected" class="absolute left-3 top-3 bg-white rounded-full pl-3 pr-1 py-1 shadow flex items-center gap-2 text-sm font-semibold">
                    {{ selected }}
                    <button type="button" class="size-7 rounded-full hover:bg-ink-100 flex items-center justify-center" aria-label="Показать все районы" @click="pick(null)">
                        <i class="pi pi-times text-[11px]"></i>
                    </button>
                </div>
            </div>

            <!-- Рейтинг районов -->
            <div class="min-w-0">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">Топ районов</div>
                <div v-if="!rows.length && !loading" class="text-sm text-ink-400">Нет данных.</div>
                <ul class="list-none m-0 p-0 space-y-1 max-h-[430px] overflow-y-auto">
                    <li v-for="r in rows" :key="r.name">
                        <button type="button" @click="pick(r.name)" :disabled="r.unknown"
                                class="w-full text-left rounded-lg px-2.5 py-2 transition"
                                :class="selected === r.name ? 'bg-tomato-500/10' : r.unknown ? 'opacity-70 cursor-default' : 'hover:bg-ink-50'">
                            <div class="flex items-baseline justify-between gap-2">
                                <span class="font-semibold text-sm truncate" :class="r.unknown ? 'text-ink-400' : ''">{{ r.name }}</span>
                                <span class="text-sm font-bold shrink-0">{{ num(r.count) }}</span>
                            </div>
                            <div v-if="!r.unknown" class="mt-1.5 h-1.5 rounded-full bg-ink-100 overflow-hidden">
                                <div class="h-full rounded-full bg-tomato-500" :style="{ width: `${(r.count / maxCount) * 100}%` }"></div>
                            </div>
                        </button>
                    </li>
                </ul>
            </div>
        </div>

        <!-- Таблица -->
        <div v-show="view === 'table'" class="overflow-x-auto">
            <table class="w-full text-sm border-collapse min-w-[640px]">
                <thead>
                    <tr class="text-left text-xs uppercase tracking-wider text-ink-400 border-b border-ink-100">
                        <th v-for="s in SORTS" :key="s.key" class="py-2.5 px-2 font-bold" :class="s.key === 'name' ? '' : 'text-right'"
                            :aria-sort="sortKey === s.key ? 'descending' : 'none'">
                            <button type="button" class="inline-flex items-center gap-1 hover:text-ink-700" @click="sortKey = s.key">
                                {{ s.label }}<i v-if="sortKey === s.key" class="pi pi-sort-amount-down text-[10px]"></i>
                            </button>
                        </th>
                        <th class="py-2.5 px-2 font-bold w-[26%]">Доля заказов</th>
                        <th class="py-2.5 px-2 font-bold text-right">Доля выручки</th>
                        <th class="py-2.5 px-2"><span class="sr-only">Действия</span></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="7" class="py-8 text-center text-ink-400"><i class="pi pi-spin pi-spinner mr-2"></i>Загрузка…</td></tr>
                    <tr v-else-if="!rows.length"><td colspan="7" class="py-8 text-center text-ink-400">За период заказов нет.</td></tr>
                    <template v-else>
                    <tr v-for="r in rows" :key="r.name" class="border-b border-ink-50 last:border-0"
                        :class="r.unknown ? 'text-ink-400' : ''">
                        <td class="py-2.5 px-2 font-semibold">{{ r.name }}</td>
                        <td class="py-2.5 px-2 text-right font-bold">{{ num(r.count) }}</td>
                        <td class="py-2.5 px-2 text-right">{{ fmt(r.revenue) }}</td>
                        <td class="py-2.5 px-2 text-right">{{ fmt(r.avg) }}</td>
                        <td class="py-2.5 px-2">
                            <div class="flex items-center gap-2">
                                <div class="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                                    <div class="h-full rounded-full" :class="r.unknown ? 'bg-ink-300' : 'bg-tomato-500'" :style="{ width: `${r.share}%` }"></div>
                                </div>
                                <span class="w-12 text-right text-xs font-semibold">{{ r.share }}%</span>
                            </div>
                        </td>
                        <td class="py-2.5 px-2 text-right text-xs font-semibold">{{ r.revenueShare }}%</td>
                        <td class="py-2.5 px-2 text-right">
                            <button v-if="!r.unknown" type="button" class="text-xs font-semibold text-tomato-600 hover:underline whitespace-nowrap" @click="pick(r.name)">
                                На карте →
                            </button>
                        </td>
                    </tr>
                    </template>
                </tbody>
                <tfoot v-if="rows.length && !loading">
                    <tr class="border-t-2 border-ink-100 font-bold">
                        <td class="py-2.5 px-2">Итого</td>
                        <td class="py-2.5 px-2 text-right">{{ num(totals.count) }}</td>
                        <td class="py-2.5 px-2 text-right">{{ fmt(totals.revenue) }}</td>
                        <td class="py-2.5 px-2 text-right">{{ fmt(totals.count ? totals.revenue / totals.count : 0) }}</td>
                        <td colspan="3"></td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- Пояснения -->
        <div class="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-400">
            <span v-if="noCoords > 0"><i class="pi pi-info-circle text-[10px] mr-1"></i>{{ num(noCoords) }} заказов без точки — на карте их нет, в таблице учтены по адресу</span>
            <span v-if="geoState.running"><i class="pi pi-spin pi-spinner text-[10px] mr-1"></i>Определяем районы через Яндекс… осталось {{ num(geoState.left) }}</span>
            <span v-else-if="!geoState.configured && geoState.left > 0" class="text-tomato-600">
                На сервере не задан YANDEX_GEOCODER_KEY — районы по координатам не определяются ({{ num(geoState.left) }} заказов)
            </span>
            <span v-else-if="geoState.error" class="text-tomato-600">Геокодер Яндекса: {{ geoState.error }}</span>
            <span v-else-if="geoState.left > 0">Ещё {{ num(geoState.left) }} заказов ждут определения района — продолжится при следующем открытии</span>
            <span v-if="truncated" class="text-tomato-600">Показаны первые 20 000 заказов — сузьте период</span>
            <span>Район определяется на сервере: из адреса, а если его там нет — по координатам через Яндекс</span>
        </div>
    </section>
</template>
