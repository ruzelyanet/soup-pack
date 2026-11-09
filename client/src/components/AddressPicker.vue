<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'

/* Яндекс.Карты 2.1 — грузим скрипт один раз по первой необходимости. */
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
    modelValue?: string
    lat?: number
    lng?: number
    apt?: string
    label?: string
    placeholder?: string
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', v: string): void
    (e: 'update:lat', v: number): void
    (e: 'update:lng', v: number): void
    (e: 'update:apt', v: string): void
}>()

const TASHKENT: [number, number] = [41.3111, 69.2797]

const open = ref(false)
const mapEl = ref<HTMLDivElement | null>(null)
let map: any = null

const tempAddress = ref('')
const tempHouse = ref('')
const tempApt = ref('')
const tempCoords = ref<{ lat: number; lng: number } | null>(null)
const geocoding = ref(false)
const geocodeError = ref('')
const locating = ref(false)
const locateError = ref('')
const mapError = ref('')

function splitAddress(src: string): { address: string; house: string; apt: string } {
    const s = String(src || '').trim()
    if (!s) return { address: '', house: '', apt: '' }
    const aptMatch = s.match(/,\s*кв\.?\s*(\S+)/i)
    const houseMatch = s.match(/,\s*д\.?\s*(\S+)/i)
    let base = s
    if (aptMatch) base = base.replace(aptMatch[0], '')
    if (houseMatch) base = base.replace(houseMatch[0], '')
    let house = houseMatch?.[1] || ''
    // Fallback: если нет префикса «д.», но последняя часть через запятую похожа на номер — вытащим.
    if (!house) {
        const parts = base.split(',').map((x) => x.trim()).filter(Boolean)
        const last = parts[parts.length - 1] || ''
        if (/^\d+[А-Яа-яA-Za-z]?(\/\d+)?$/.test(last)) {
            house = last
        }
    }
    return { address: base.trim(), house, apt: aptMatch?.[1] || '' }
}

function openModal() {
    const parts = splitAddress(props.modelValue || '')
    tempAddress.value = parts.address
    tempHouse.value = parts.house
    // Явно переданная apt (v-model:apt) приоритетнее того, что было вшито в строку адреса.
    tempApt.value = (props.apt ?? '').trim() || parts.apt
    tempCoords.value =
        props.lat != null && props.lng != null
            ? { lat: props.lat, lng: props.lng }
            : null
    open.value = true
    nextTick(initMap)
}

async function initMap() {
    if (!mapEl.value || map) return
    mapError.value = ''
    const start: [number, number] = tempCoords.value
        ? [tempCoords.value.lat, tempCoords.value.lng]
        : TASHKENT
    try {
        const ymaps = await loadYmaps()
        map = new ymaps.Map(mapEl.value, {
            center: start,
            zoom: tempCoords.value ? 17 : 13,
            // Как у Delever: zoomControl + geolocationControl (но без placemark от яндекса — мы ставим свой центр-пин).
            controls: ['zoomControl', 'geolocationControl'],
        }, { suppressMapOpenBlock: true, geolocationControlOptions: { noPlacemark: true } })

        // Пин у нас не на карте, а HTML-оверлей по центру модалки.
        // Слушаем обоa события — `boundschange` стреляет на любое движение/zoom,
        // `actionend` — на завершение жеста. Debounce 300ms + skip, пока геокод уже идёт.
        let moveTimer: number | null = null
        const onMove = () => {
            const c = map.getCenter() as [number, number]
            tempCoords.value = { lat: c[0], lng: c[1] }
            if (moveTimer) window.clearTimeout(moveTimer)
            moveTimer = window.setTimeout(() => reverseGeocode(c[0], c[1]), 300)
        }
        map.events.add('boundschange', onMove)
        map.events.add('actionend', onMove)

        // Если точка уже была — сразу подхватим адрес.
        if (tempCoords.value) {
            reverseGeocode(tempCoords.value.lat, tempCoords.value.lng)
        }
    } catch (e: any) {
        mapError.value = e?.message?.includes('load')
            ? 'Не удалось загрузить Яндекс.Карты. Проверьте интернет и VITE_YANDEX_MAPS_KEY.'
            : (e?.message || 'Ошибка карты')
    }
}

async function setPoint(lat: number, lng: number) {
    tempCoords.value = { lat, lng }
    map?.setCenter([lat, lng], Math.max(map.getZoom(), 17), { duration: 400 })
    // reverseGeocode сработает по actionend; на всякий случай зовём и явно.
    reverseGeocode(lat, lng)
}

function useMyLocation() {
    locateError.value = ''
    if (!('geolocation' in navigator)) {
        locateError.value = 'Браузер не поддерживает геолокацию.'
        return
    }
    locating.value = true
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords
            map?.setCenter([latitude, longitude], 17, { duration: 400 })
            setPoint(latitude, longitude)
            locating.value = false
        },
        (err) => {
            locating.value = false
            if (err.code === err.PERMISSION_DENIED) {
                locateError.value = 'Доступ к геолокации запрещён. Разрешите его в настройках браузера.'
            } else if (err.code === err.POSITION_UNAVAILABLE) {
                locateError.value = 'Не удалось определить позицию. Проверьте GPS/сеть.'
            } else if (err.code === err.TIMEOUT) {
                locateError.value = 'Геолокация не ответила — попробуйте ещё раз.'
            } else {
                locateError.value = err.message || 'Не удалось определить позицию.'
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
}

/** Разобрать GeoObject Яндекса — полный адрес в поиск + номер дома в отдельное поле. */
function pickAddress(first: any): { address: string; house: string } {
    const addressLine = String(first?.getAddressLine?.() || '').trim()
    const house = String(first?.getPremiseNumber?.() || '').trim()
    return { address: addressLine, house }
}

/** Reverse-geocode через OSM Nominatim — бесплатно, без ключа.
 *  Red-flag: по клику на дорогу `house_number` часто пуст — тогда дотягиваем Photon'ом. */
async function reverseGeocodeNominatim(lat: number, lng: number): Promise<{ address: string; house: string } | null> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru&zoom=18`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error('nominatim ' + res.status)
    const data: any = await res.json()
    const a = data.address || {}
    const road = a.road || a.pedestrian || a.residential || a.neighbourhood
    let house = a.house_number || ''
    const district = a.suburb || a.city_district
    const city = a.city || a.town || a.village

    // Если дом не нашёлся — пробуем Photon (ищет ближайший POI в радиусе).
    if (!house) {
        try {
            const photonUrl = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&limit=5`
            const pr = await fetch(photonUrl)
            if (pr.ok) {
                const pd = await pr.json()
                for (const f of pd.features || []) {
                    const p = f.properties || {}
                    if (p.housenumber) {
                        house = String(p.housenumber)
                        break
                    }
                }
            }
        } catch { /* ignore — хотя бы адрес без номера покажем */ }
    }

    const parts: string[] = []
    if (road) parts.push(house ? `${road}, ${house}` : road)
    if (district && district !== road) parts.push(district)
    if (city && city !== district) parts.push(city)
    const address = parts.join(', ') || data.display_name || ''
    return address ? { address, house } : null
}

/** В сессии запоминаем, что Яндекс-геокодер не работает — чтобы следующие вызовы
 *  сразу шли в Nominatim без ожидания 3-секундного timeout. */
let yandexGeocoderBroken = false

async function tryYandexGeocode(lat: number, lng: number): Promise<{ address: string; house: string } | null> {
    if (yandexGeocoderBroken) return null
    const ymaps = (window as any).ymaps
    if (!ymaps?.geocode) return null
    try {
        // Яндекс SDK использует JSONP: при 403 промис может висеть, поэтому race с timeout.
        const geocoderCall = (async () => {
            const geoOpts: Record<string, any> = { results: 1 }
            if (YANDEX_GEOCODER_KEY) geoOpts.apikey = YANDEX_GEOCODER_KEY
            const res = await ymaps.geocode([lat, lng], geoOpts)
            const first = res.geoObjects.get(0)
            if (!first) return null
            const { address, house } = pickAddress(first)
            return address ? { address, house } : null
        })()
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))
        const result = await Promise.race([geocoderCall, timeout])
        if (result === null) {
            // Либо реально пусто, либо timeout — считаем, что сломан, и дальше в сессии не трогаем.
            yandexGeocoderBroken = true
        }
        return result
    } catch (err) {
        console.warn('[reverseGeocode] yandex failed', err)
        yandexGeocoderBroken = true
        return null
    }
}

async function reverseGeocode(lat: number, lng: number) {
    geocoding.value = true
    geocodeError.value = ''
    try {
        // 1) Яндекс (точнее для Узбекистана, если ключ активирован).
        const yandex = await tryYandexGeocode(lat, lng)
        if (yandex) {
            tempAddress.value = yandex.address
            if (yandex.house) tempHouse.value = yandex.house
            return
        }
        // 2) Fallback на OSM Nominatim — бесплатно, без ключа.
        try {
            const nom = await reverseGeocodeNominatim(lat, lng)
            if (nom) {
                tempAddress.value = nom.address
                if (nom.house) tempHouse.value = nom.house
            } else {
                geocodeError.value = 'Адрес не найден — впишите вручную.'
            }
        } catch (e) {
            console.warn('[reverseGeocode] nominatim failed', e)
            geocodeError.value = 'Не удалось получить адрес — впишите вручную.'
        }
    } finally {
        geocoding.value = false
    }
}

async function geocodeSearch() {
    const q = tempAddress.value.trim()
    if (!q) return
    geocoding.value = true
    geocodeError.value = ''
    try {
        const ymaps = (window as any).ymaps
        if (!ymaps?.geocode) throw new Error('geocoder not loaded')
        // Ограничим Узбекистаном, чтобы Ташкентские дома находились первыми.
        const geoOpts: Record<string, any> = { results: 1 }
        if (YANDEX_GEOCODER_KEY) geoOpts.apikey = YANDEX_GEOCODER_KEY
        const res = await ymaps.geocode('Узбекистан, ' + q, geoOpts)
        const first = res.geoObjects.get(0)
        if (first) {
            const c = first.geometry.getCoordinates() as [number, number]
            const { address, house } = pickAddress(first)
            if (address) tempAddress.value = address
            if (house) tempHouse.value = house
            tempCoords.value = { lat: c[0], lng: c[1] }
            map?.setCenter(c, 17, { duration: 400 })
        } else {
            geocodeError.value = 'Адрес не найден.'
        }
    } catch (err) {
        console.error('[geocodeSearch]', err)
        geocodeError.value = 'Не удалось выполнить поиск.'
    } finally {
        geocoding.value = false
    }
}

function confirmPick() {
    if (!tempAddress.value && !tempCoords.value) {
        open.value = false
        return
    }
    const parts = [tempAddress.value.trim()]
    if (tempHouse.value.trim()) parts.push('д. ' + tempHouse.value.trim())
    // Квартира идёт ОТДЕЛЬНЫМ emit'ом в поле формы (v-model:apt),
    // а не внутрь строки адреса — иначе она дублируется и теряется в поле «Кв.».
    emit('update:modelValue', parts.filter(Boolean).join(', '))
    emit('update:apt', tempApt.value.trim())
    if (tempCoords.value) {
        emit('update:lat', tempCoords.value.lat)
        emit('update:lng', tempCoords.value.lng)
    }
    open.value = false
}

function clearSearch() {
    tempAddress.value = ''
}

watch(open, (v) => {
    if (!v && map) {
        try { map.destroy() } catch { /* noop */ }
        map = null
    }
})

onBeforeUnmount(() => {
    if (map) {
        try { map.destroy() } catch { /* noop */ }
    }
})
</script>

<template>
    <div>
        <label v-if="label" class="text-xs font-bold uppercase tracking-wider text-ink-400">
            {{ label }}
        </label>
        <div class="mt-1 flex gap-2">
            <input
                :value="modelValue"
                @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
                :placeholder="placeholder || 'Улица, дом, квартира'"
                class="flex-1 rounded-xl border border-cream-200 px-4 py-3 bg-white focus:outline-none focus:border-ink-900"
            />
            <button
                type="button"
                class="shrink-0 inline-flex items-center gap-2 rounded-xl bg-ink-900 text-cream-50 px-4 py-3 font-semibold hover:bg-ink-700 transition"
                @click="openModal"
            >
                <span class="pi pi-map-marker"></span>
                <span class="hidden sm:inline">На карте</span>
            </button>
        </div>
        <p v-if="lat != null && lng != null"
           class="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-ok-bg text-ok text-[11px] font-bold px-2 py-1 leading-none">
            <span class="pi pi-check-circle text-[12px]"></span>
            Точка сохранена: {{ lat.toFixed(5) }}, {{ lng.toFixed(5) }}
        </p>

        <Dialog
            v-model:visible="open"
            modal
            :show-header="false"
            :style="{ width: '860px', maxWidth: '95vw' }"
            :pt="{ content: { class: 'p-0 overflow-visible' }, root: { class: 'rounded-3xl overflow-hidden' } }"
        >
            <div class="relative bg-sf">
                <!-- Шапка -->
                <div class="px-6 pt-6 pr-16">
                    <h2 class="font-display font-extrabold text-[22px] text-ink leading-tight">
                        Выберите адрес доставки
                    </h2>
                    <p class="mt-1 text-sm text-mut">Это нужно, чтобы увидеть актуальное меню и доставить вовремя.</p>
                </div>
                <button type="button"
                        class="absolute top-5 right-5 size-10 rounded-full bg-sf2 flex items-center justify-center text-ink hover:bg-ln"
                        aria-label="Закрыть"
                        @click="open = false">
                    <span class="pi pi-times text-[14px]"></span>
                </button>

                <!-- Поиск адреса -->
                <div class="px-6 mt-4">
                    <div class="relative">
                        <span class="pi pi-search absolute left-4 top-1/2 -translate-y-1/2 text-mut text-[14px]"></span>
                        <input
                            v-model="tempAddress"
                            :placeholder="geocoding ? 'Определяем адрес…' : 'Поиск адреса'"
                            class="w-full h-12 rounded-xl border-2 border-acc bg-sf pl-11 pr-11 text-ink font-semibold focus:outline-none"
                            @keyup.enter="geocodeSearch"
                        />
                        <button v-if="tempAddress" type="button"
                                class="absolute right-3 top-1/2 -translate-y-1/2 size-6 rounded-full bg-mut/40 flex items-center justify-center text-sf hover:bg-mut"
                                aria-label="Очистить"
                                @click="clearSearch">
                            <span class="pi pi-times text-[9px]"></span>
                        </button>
                    </div>
                    <p v-if="geocodeError" class="text-xs text-acc mt-1.5">{{ geocodeError }}</p>
                </div>

                <!-- Дом / Квартира -->
                <div class="px-6 mt-3 grid grid-cols-2 gap-3">
                    <div class="relative">
                        <label class="absolute left-4 top-2 text-[11px] font-semibold text-mut pointer-events-none">Дом</label>
                        <input
                            v-model="tempHouse"
                            class="w-full h-14 rounded-xl border-2 border-ln2 bg-sf pt-6 pb-2 px-4 text-ink font-bold focus:outline-none focus:border-acc transition"
                        />
                    </div>
                    <div class="relative">
                        <label class="absolute left-4 top-2 text-[11px] font-semibold text-mut pointer-events-none">Квартира</label>
                        <input
                            v-model="tempApt"
                            class="w-full h-14 rounded-xl border-2 border-ln2 bg-sf pt-6 pb-2 px-4 text-ink font-bold focus:outline-none focus:border-acc transition"
                        />
                    </div>
                </div>

                <!-- Карта -->
                <div class="relative mt-4 mx-6 rounded-2xl overflow-hidden">
                    <div ref="mapEl" class="w-full h-[340px]" style="background:#eef1f3"></div>

                    <!-- Маркер один-в-один как у yaponamama: красный круг с белым центром
                         (chakra-spinner idle = ring), тонкая ножка, круглая тень. -->
                    <div v-if="!mapError"
                         class="pointer-events-none absolute top-1/2 left-1/2 z-[500] flex flex-col items-center"
                         style="transform: translate(-50%, calc(-100% + 2px))">
                        <!-- Head: внешний красный круг + внутренний белый круг (кольцо) -->
                        <div class="relative size-8 rounded-full bg-acc shadow-[0_2px_4px_rgba(0,0,0,.35)] flex items-center justify-center">
                            <!-- Внутренний белый круг (как в идле Chakra spinner) -->
                            <span v-if="!geocoding" class="size-[14px] rounded-full bg-white"></span>
                            <!-- Активный Chakra-style spinner во время загрузки -->
                            <span v-else class="size-[18px] rounded-full border-[3px] border-white/30 border-t-white animate-spin"></span>
                        </div>
                        <!-- Stick: тонкая вертикальная ножка -->
                        <div class="w-[3px] h-[22px] bg-acc"></div>
                        <!-- Shadow: круглая тень под кончиком -->
                        <div class="w-[10px] h-[10px] rounded-full bg-black/30 blur-[3px] -mt-1"></div>
                    </div>

                    <p v-if="mapError"
                       class="absolute inset-0 z-[1000] bg-sf/95 flex items-center justify-center px-6 text-center text-acc text-sm font-semibold">
                        {{ mapError }}
                    </p>
                    <!-- Таблетка «моя геопозиция» -->
                    <button
                        type="button"
                        :aria-busy="locating"
                        :disabled="locating || !!mapError"
                        @click="useMyLocation"
                        class="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-sf rounded-full shadow-lg px-4 h-10 flex items-center gap-2 text-ink font-semibold text-sm hover:bg-sf2 disabled:opacity-70"
                    >
                        <span v-if="locating" class="pi pi-spin pi-spinner text-[14px]"></span>
                        <span v-else class="pi pi-send text-[13px]"></span>
                        {{ locating ? 'Определяем…' : 'Определение местоположения' }}
                    </button>
                    <p v-if="locateError && !mapError"
                       class="absolute top-3 left-3 right-3 z-[1000] rounded-lg bg-sf/95 text-acc text-xs font-semibold px-3 py-2 shadow">
                        {{ locateError }}
                    </p>
                </div>

                <!-- Сохранить -->
                <div class="px-6 pb-6 pt-5">
                    <button
                        type="button"
                        class="w-full h-[56px] rounded-2xl bg-acc hover:bg-acct text-white font-extrabold text-[16px]"
                        @click="confirmPick"
                    >
                        Сохранить
                    </button>
                </div>
            </div>
        </Dialog>
    </div>
</template>
