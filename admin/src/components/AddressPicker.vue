<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/** Яндекс.Карты 2.1 — грузим скрипт один раз по первой необходимости. */
const YANDEX_API_KEY = import.meta.env.VITE_YANDEX_MAPS_KEY as string | undefined
const YANDEX_GEOCODER_KEY = import.meta.env.VITE_YANDEX_GEOCODER_KEY as string | undefined

let ymapsPromise: Promise<any> | null = null
function loadYmaps(): Promise<any> {
    if ((window as any).ymaps?.Map) {
        return (window as any).ymaps.ready().then(() => (window as any).ymaps)
    }
    if (ymapsPromise) return ymapsPromise
    ymapsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        const key = YANDEX_API_KEY ? `apikey=${encodeURIComponent(YANDEX_API_KEY)}&` : ''
        script.src = `https://api-maps.yandex.ru/2.1/?${key}lang=ru_RU`
        script.async = true
        script.onload = () => (window as any).ymaps.ready(() => resolve((window as any).ymaps))
        script.onerror = () => reject(new Error('yandex maps load failed'))
        document.head.appendChild(script)
    })
    return ymapsPromise
}

const props = defineProps<{
    address: string
    lat?: number | null
    lng?: number | null
}>()
const emit = defineEmits<{
    (e: 'update:address', v: string): void
    (e: 'update:lat', v: number | null): void
    (e: 'update:lng', v: number | null): void
}>()

/** Центр Ташкента по умолчанию. */
const TASHKENT: [number, number] = [41.3111, 69.2797]

const mapEl = ref<HTMLDivElement | null>(null)
const searchInput = ref(props.address || '')
const mapError = ref('')
const geocoding = ref(false)
const expanded = ref(false)

let map: any = null
let placemark: any = null
let moveTimer: number | null = null

function setPoint(lat: number, lng: number, flyTo = true) {
    if (!map) return
    if (!placemark) {
        placemark = new (window as any).ymaps.Placemark([lat, lng], {}, {
            draggable: true,
            preset: 'islands#redDotIcon',
        })
        placemark.events.add('dragend', () => {
            const c = placemark.geometry.getCoordinates() as [number, number]
            emit('update:lat', c[0])
            emit('update:lng', c[1])
            scheduleReverse(c[0], c[1])
        })
        map.geoObjects.add(placemark)
    } else {
        placemark.geometry.setCoordinates([lat, lng])
    }
    emit('update:lat', lat)
    emit('update:lng', lng)
    if (flyTo) map.setCenter([lat, lng], Math.max(map.getZoom(), 15), { duration: 300 })
}

function scheduleReverse(lat: number, lng: number) {
    if (moveTimer) window.clearTimeout(moveTimer)
    moveTimer = window.setTimeout(() => reverseGeocode(lat, lng), 300)
}

/** В сессии запоминаем, что Яндекс-геокодер не работает — следующие вызовы сразу идут в Nominatim. */
let yandexGeocoderBroken = false

async function tryYandexReverse(lat: number, lng: number): Promise<string | null> {
    if (yandexGeocoderBroken) return null
    const ymaps = (window as any).ymaps
    if (!ymaps?.geocode) return null
    try {
        const geoOpts: Record<string, any> = { results: 1 }
        if (YANDEX_GEOCODER_KEY) geoOpts.apikey = YANDEX_GEOCODER_KEY
        // Яндекс SDK использует JSONP — при 403 промис может висеть, поэтому race с timeout.
        const call = (async () => {
            const res = await ymaps.geocode([lat, lng], geoOpts)
            const first = res.geoObjects.get(0)
            if (!first) return null
            const addr = String(first.getAddressLine?.() || '').trim()
            return addr || null
        })()
        const timeout = new Promise<null>((r) => setTimeout(() => r(null), 2500))
        const result = await Promise.race([call, timeout])
        if (result === null) yandexGeocoderBroken = true
        return result
    } catch (e) {
        console.warn('[AddressPicker] yandex reverse failed', e)
        yandexGeocoderBroken = true
        return null
    }
}

async function reverseGeocodeNominatim(lat: number, lng: number): Promise<string | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru&zoom=18`
        const res = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!res.ok) return null
        const data: any = await res.json()
        const a = data.address || {}
        const road = a.road || a.pedestrian || a.residential || a.neighbourhood
        const house = a.house_number || ''
        const district = a.suburb || a.city_district
        const city = a.city || a.town || a.village
        const parts: string[] = []
        if (road) parts.push(house ? `${road}, ${house}` : road)
        if (district && district !== road) parts.push(district)
        if (city && city !== district) parts.push(city)
        return parts.join(', ') || data.display_name || null
    } catch { return null }
}

async function reverseGeocode(lat: number, lng: number) {
    geocoding.value = true
    try {
        const addr = (await tryYandexReverse(lat, lng)) || (await reverseGeocodeNominatim(lat, lng))
        if (addr) {
            searchInput.value = addr
            emit('update:address', addr)
        }
    } finally {
        geocoding.value = false
    }
}

async function geocodeSearch() {
    const q = searchInput.value.trim()
    if (!q) return
    const ymaps = (window as any).ymaps
    if (!ymaps?.geocode) return
    geocoding.value = true
    try {
        const geoOpts: Record<string, any> = { results: 1 }
        if (YANDEX_GEOCODER_KEY) geoOpts.apikey = YANDEX_GEOCODER_KEY
        const res = await ymaps.geocode('Узбекистан, ' + q, geoOpts)
        const first = res.geoObjects.get(0)
        if (!first) return
        const c = first.geometry.getCoordinates() as [number, number]
        const addr = String(first.getAddressLine?.() || '').trim()
        if (addr) {
            searchInput.value = addr
            emit('update:address', addr)
        }
        setPoint(c[0], c[1])
    } catch { /* noop */ }
    finally { geocoding.value = false }
}

function onSearchInput() {
    emit('update:address', searchInput.value)
}

async function initMap() {
    if (!mapEl.value || map) return
    try {
        await loadYmaps()
        const start: [number, number] = props.lat && props.lng
            ? [Number(props.lat), Number(props.lng)]
            : TASHKENT
        map = new (window as any).ymaps.Map(mapEl.value, {
            center: start,
            zoom: props.lat && props.lng ? 16 : 12,
            controls: ['zoomControl', 'geolocationControl'],
        }, { suppressMapOpenBlock: true })
        map.events.add('click', (e: any) => {
            const c = e.get('coords') as [number, number]
            setPoint(c[0], c[1], false)
            scheduleReverse(c[0], c[1])
        })
        if (props.lat && props.lng) setPoint(Number(props.lat), Number(props.lng), false)
    } catch (e: any) {
        mapError.value = 'Не удалось загрузить Яндекс.Карты. Проверьте VITE_YANDEX_MAPS_KEY.'
    }
}

async function openMap() {
    expanded.value = true
    await nextTick()
    await initMap()
}
function collapseMap() {
    if (map) { try { map.destroy() } catch { /* noop */ } }
    map = null
    placemark = null
    expanded.value = false
}

onBeforeUnmount(() => {
    if (moveTimer) window.clearTimeout(moveTimer)
    if (map) { try { map.destroy() } catch { /* noop */ } }
    map = null; placemark = null
})

watch(() => props.address, (v) => { if (v !== searchInput.value) searchInput.value = v || '' })
</script>

<template>
    <div class="space-y-2">
        <div class="flex items-center rounded-xl border border-ink-200 focus-within:border-ink-900 overflow-hidden">
            <i class="pi pi-search pl-3 text-ink-400 text-sm" />
            <input v-model="searchInput" type="text" placeholder="Введите адрес и Enter…"
                   class="flex-1 px-2.5 py-2.5 focus:outline-none text-sm"
                   @input="onSearchInput" @keyup.enter="geocodeSearch" />
            <button type="button"
                    class="shrink-0 px-3 h-full text-ink-700 hover:text-ink-900 text-sm font-semibold"
                    title="Найти"
                    @click="geocodeSearch">
                <i :class="geocoding ? 'pi pi-spin pi-spinner' : 'pi pi-search-plus'" />
            </button>
        </div>
        <div v-if="!expanded" class="flex items-center justify-between gap-3">
            <div v-if="lat != null && lng != null" class="text-xs text-ink-500 flex items-center gap-1 min-w-0">
                <i class="pi pi-check-circle text-emerald-500 text-xs shrink-0" />
                <span class="truncate">Точка: {{ Number(lat).toFixed(5) }}, {{ Number(lng).toFixed(5) }}</span>
            </div>
            <div v-else class="text-xs text-ink-400">Точка не выбрана</div>
            <button type="button"
                    class="shrink-0 inline-flex items-center gap-2 rounded-xl bg-ink-900 text-cream-50 px-4 py-2 text-sm font-semibold hover:bg-ink-700"
                    @click="openMap">
                <i class="pi pi-map-marker text-xs" />
                {{ lat != null && lng != null ? 'Изменить на карте' : 'Указать на карте' }}
            </button>
        </div>

        <div v-else class="space-y-2">
            <div class="relative">
                <div ref="mapEl" class="w-full h-[280px] rounded-xl overflow-hidden border border-ink-200"
                     style="background:#eef1f3"></div>
                <div v-if="mapError"
                     class="absolute inset-0 rounded-xl flex items-center justify-center bg-white/95 text-tomato-500 text-sm font-semibold text-center px-6">
                    {{ mapError }}
                </div>
            </div>
            <div class="flex items-center justify-between gap-2">
                <div v-if="lat != null && lng != null" class="text-xs text-ink-500">
                    <i class="pi pi-check-circle text-emerald-500 text-xs" />
                    {{ Number(lat).toFixed(5) }}, {{ Number(lng).toFixed(5) }}
                </div>
                <div v-else class="text-xs text-ink-400">Кликните на карте для выбора точки</div>
                <button type="button"
                        class="shrink-0 text-xs font-semibold text-ink-600 hover:text-ink-900 inline-flex items-center gap-1"
                        @click="collapseMap">
                    <i class="pi pi-times text-xs" /> Свернуть карту
                </button>
            </div>
        </div>
    </div>
</template>
