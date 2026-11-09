<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import SoupPuck from '@/components/SoupPuck.vue'
import PeriodPicker from '@/components/PeriodPicker.vue'
import { Products, Categories, Orders, OrderSets,
         type Category, type Order, type OrderSet, type Price, type Product } from '@/services/resources'
import { api, mediaUrl, uploadMedia } from '@/services/api'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import DatePicker from 'primevue/datepicker'
import InputChips from 'primevue/inputchips'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const isNew = ref(route.params.id === 'new')
const mode = ref<'view' | 'edit'>(isNew.value ? 'edit' : 'view')
const loading = ref(!isNew.value)
const categories = ref<Category[]>([])
const product = ref<Product | null>(null)
const allOrders = ref<Order[]>([])
const allSets = ref<OrderSet[]>([])

/** Период для статистики: null = «Всё время», либо [from, to]. */
const periodRange = ref<[Date, Date] | null>(null)
// Инициализация: 30 дней по умолчанию.
{
    const to = new Date(); to.setHours(23, 59, 59, 999)
    const from = new Date(to); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0)
    periodRange.value = [from, to]
}

const form = reactive({
    id: 0,
    documentId: '',
    name: '',
    slug: '',
    categoryId: null as number | null,
    price: 0,
    weight: 350,
    description: '',
    /** Ингредиенты — массив строк. */
    composition: [] as string[],
    available: true,
})

/** Нормализуем в массив (legacy — строка). */
function toArr(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((s) => String(s)).filter((s) => s.trim().length)
    if (typeof v === 'string' && v.trim()) {
        // старые записи — строка с ингредиентами через «,» или «.»
        return v.split(/[,.;]+/).map((s) => s.trim()).filter(Boolean)
    }
    return []
}


// Скидки на товар управляются через раздел «Скидки» — поля discount* удалены из схемы.

// ───────── Цены (история и план) ─────────

const prices = ref<Price[]>([])
const pricesLoading = ref(false)

/** Строка, действующая прямо сейчас. */
const currentPrice = computed<Price | null>(() => {
    const now = Date.now()
    const match = prices.value
        .filter((p) => new Date(p.validFrom).getTime() <= now)
        .filter((p) => !p.validTo || new Date(p.validTo).getTime() > now)
    if (!match.length) return null
    return match.sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime())[0]
})

/** Все плановые — те, у которых validFrom в будущем. */
const futurePrices = computed(() => {
    const now = Date.now()
    return prices.value
        .filter((p) => new Date(p.validFrom).getTime() > now)
        .sort((a, b) => new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime())
})

/** Все прошлые — у которых validTo <= now (закрытые). */
const pastPrices = computed(() => {
    const now = Date.now()
    return prices.value
        .filter((p) => p.validTo && new Date(p.validTo).getTime() <= now)
        .sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime())
})

async function loadPrices() {
    if (!form.id || isNew.value) {
        prices.value = []
        return
    }
    pricesLoading.value = true
    try {
        const res = await api.get(`/staff/products/${form.id}/prices`)
        prices.value = (res.data?.data || []) as Price[]
    } catch (e: any) {
        toast.add({ severity: 'warn', summary: 'Не удалось загрузить историю цен',
                    detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
        prices.value = []
    } finally {
        pricesLoading.value = false
    }
}

// Модалка «Изменить цену».
const priceDialog = ref(false)
const priceDraft = reactive<{
    amount: number
    startWhen: 'now' | 'later'
    futureDate: Date | null
    comment: string
    saving: boolean
}>({ amount: 0, startWhen: 'now', futureDate: null, comment: '', saving: false })

function openPriceDialog() {
    priceDraft.amount = currentPrice.value?.amount ?? form.price ?? 0
    priceDraft.startWhen = 'now'
    priceDraft.futureDate = null
    priceDraft.comment = ''
    priceDialog.value = true
}

async function submitPriceChange() {
    const amount = Math.round(Number(priceDraft.amount))
    if (!(amount > 0)) {
        toast.add({ severity: 'warn', summary: 'Цена должна быть больше 0', life: 2500 })
        return
    }
    let validFrom: string | undefined
    if (priceDraft.startWhen === 'later') {
        if (!priceDraft.futureDate) {
            toast.add({ severity: 'warn', summary: 'Выберите дату и время начала', life: 2500 })
            return
        }
        if (priceDraft.futureDate.getTime() <= Date.now()) {
            toast.add({ severity: 'warn', summary: 'Дата должна быть в будущем', life: 2500 })
            return
        }
        validFrom = priceDraft.futureDate.toISOString()
    }
    priceDraft.saving = true
    try {
        await api.post(`/staff/products/${form.id}/prices`, {
            amount,
            validFrom,
            comment: priceDraft.comment || null,
        })
        toast.add({ severity: 'success', summary: 'Цена обновлена', life: 1800 })
        priceDialog.value = false
        // Обновляем историю и локальный кеш form.price.
        await loadPrices()
        if (currentPrice.value) form.price = currentPrice.value.amount
    } catch (e: any) {
        const code = e?.response?.data?.error?.details?.code
        const msg = code === 'PRICE_PERIOD_OVERLAP'
            ? 'Период пересекается с уже существующей плановой ценой'
            : code === 'PRICE_IN_PAST'
                ? 'Нельзя задать цену в прошлом'
                : e?.response?.data?.error?.message || e?.message || 'Ошибка'
        toast.add({ severity: 'error', summary: 'Не удалось сохранить цену', detail: msg, life: 4500 })
    } finally {
        priceDraft.saving = false
    }
}

function confirmCancelFuture(p: Price) {
    confirm.require({
        header: 'Отменить плановую цену?',
        message: `Цена ${new Intl.NumberFormat('ru-RU').format(p.amount)} сум с ${new Date(p.validFrom).toLocaleString('ru-RU')} будет удалена.`,
        acceptLabel: 'Отменить',
        rejectLabel: 'Назад',
        accept: async () => {
            try {
                await api.delete(`/staff/prices/${p.id}`)
                toast.add({ severity: 'success', summary: 'Плановая цена отменена', life: 1800 })
                await loadPrices()
            } catch (e: any) {
                toast.add({ severity: 'error', summary: 'Ошибка',
                            detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
            }
        },
    })
}

function fmtMoney(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
function fmtDateTime(s: string | Date | null | undefined) {
    if (!s) return '—'
    const d = new Date(s)
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const mainImage = ref<string>('')
/** Выбранный, но ещё не загруженный на сервер файл главной картинки. */
const pendingFile = ref<File | null>(null)
/** Пользователь нажал «Удалить» для существующей главной картинки. */
const imageCleared = ref(false)

/** Доп. картинка — одна (первый элемент galley). */
const secondaryImage = ref<string>('')
const pendingSecondaryFile = ref<File | null>(null)
const secondaryCleared = ref(false)

function onFile(f: File | null) {
    pendingFile.value = f
    imageCleared.value = f === null
}
function onSecondaryFile(f: File | null) {
    pendingSecondaryFile.value = f
    secondaryCleared.value = f === null
}

onMounted(async () => {
    try {
        categories.value = await Categories.list({ sort: 'sort:asc' })
    } catch { /* ignore */ }

    if (isNew.value) {
        if (categories.value.length) form.categoryId = categories.value[0].id
        else toast.add({ severity: 'warn', summary: 'Сначала создайте категорию', life: 3000 })
        return
    }

    try {
        // В URL — числовой id (стабильный для пользователя),
        // но Strapi 5 для /api/products/:X ждёт documentId; ищем по фильтру.
        const [found, orders, sets] = await Promise.all([
            Products.list({
                'filters[id][$eq]': route.params.id,
                populate: ['category', 'image', 'gallery'],
                'pagination[pageSize]': 1,
            }),
            Orders.list({ populate: ['items', 'client'], sort: 'createdAt:desc' }),
            OrderSets.list({ populate: { items: { populate: ['product'] } } }),
        ])
        const p = found[0]
        if (!p) {
            toast.add({ severity: 'warn', summary: 'Товар не найден', life: 2500 })
            router.replace('/catalog/products')
            return
        }
        product.value = p
        allOrders.value = orders
        allSets.value = sets

        Object.assign(form, {
            id: p.id, documentId: p.documentId,
            name: p.name, slug: p.slug,
            categoryId: p.category?.id ?? null,
            price: Number(p.price),
            weight: p.weight || 350,
            description: p.description || '',
            composition: toArr(p.composition),
            available: p.available,
        })
        mainImage.value = mediaUrl(p.image?.url)
        pendingFile.value = null
        imageCleared.value = false
        secondaryImage.value = mediaUrl(p.gallery?.[0]?.url)
        pendingSecondaryFile.value = null
        secondaryCleared.value = false
    } catch (e: any) {
        toast.add({
            severity: 'error', summary: 'Не удалось загрузить',
            detail: e?.response?.data?.error?.message || e?.message,
            life: 3500,
        })
    } finally {
        loading.value = false
    }
    // История и плановые цены — отдельно, после загрузки продукта.
    loadPrices()
})

/** Все строки заказов, где фигурирует этот продукт. */
const myLines = computed(() => {
    if (!product.value) return []
    const myId = product.value.id
    const list: Array<{ order: Order; qty: number; price: number }> = []
    for (const o of allOrders.value) {
        if (o.status === 'canceled') continue
        for (const it of o.items || []) {
            if (it.product?.id === myId || it.name === product.value?.name) {
                list.push({ order: o, qty: it.qty, price: Number(it.price || 0) })
            }
        }
    }
    return list
})

const filteredLines = computed(() => {
    if (!periodRange.value) return myLines.value
    const [from, to] = periodRange.value
    const fromMs = from.getTime()
    const toMs = to.getTime()
    return myLines.value.filter((l) => {
        const t = new Date(l.order.createdAt).getTime()
        return t >= fromMs && t <= toMs
    })
})

/** Длина диапазона в днях — для спарклайна. */
const rangeDays = computed(() => {
    if (!periodRange.value) return 365
    const [from, to] = periodRange.value
    return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000))
})

const stats = computed(() => {
    const l = filteredLines.value
    const sold = l.reduce((s, x) => s + x.qty, 0)
    const revenue = l.reduce((s, x) => s + x.qty * x.price, 0)
    const uniqueOrders = new Set(l.map((x) => x.order.id)).size
    const uniqueClients = new Set(l.map((x) => x.order.client?.id).filter(Boolean)).size
    const first = l.length ? l[l.length - 1].order.createdAt : null
    const last = l.length ? l[0].order.createdAt : null
    return {
        sold, revenue, orders: uniqueOrders, clients: uniqueClients,
        avg: uniqueOrders ? Math.round(revenue / uniqueOrders) : 0,
        first, last,
    }
})

const recentOrders = computed(() =>
    filteredLines.value.slice(0, 10),
)

const inSets = computed(() => {
    if (!product.value) return []
    const myId = product.value.id
    return allSets.value.filter((s) =>
        (s.items || []).some((it) => it.product?.id === myId),
    )
})

/** Малый график продаж по дням диапазона. */
const sparkline = computed(() => {
    const days = Math.min(90, rangeDays.value)   // капим график 90 бакетами
    const end = periodRange.value ? periodRange.value[1].getTime() : Date.now()
    const start = end - days * 86400000
    const buckets: number[] = Array(days).fill(0)
    for (const l of filteredLines.value) {
        const t = new Date(l.order.createdAt).getTime()
        if (t < start || t > end) continue
        const idx = Math.min(days - 1, Math.max(0, Math.floor((t - start) / 86400000)))
        buckets[idx] += l.qty
    }
    const max = Math.max(1, ...buckets)
    return buckets.map((v) => Math.round((v / max) * 100))
})

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

/** В режиме edit стрелка возвращает на просмотр, иначе — на список. */
const backAction = computed<string | (() => void)>(() => {
    if (mode.value === 'edit' && !isNew.value) {
        return () => cancelEdit()
    }
    return '/catalog/products'
})
function fmtDate(s?: string | null) {
    return s ? new Date(s).toLocaleString('ru-RU') : '—'
}

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

async function save() {
    const data: Record<string, any> = {
        name: form.name,
        slug: form.slug || form.name.toLowerCase().replace(/\s+/g, '-'),
        description: form.description,
        composition: form.composition.map((s) => s.trim()).filter(Boolean),
        weight: form.weight,
        price: form.price,
        available: form.available,
        // Strapi 5: relation на верхнем уровне ждёт documentId, а не numeric id.
        category: form.categoryId
            ? (categories.value.find((c) => c.id === form.categoryId)?.documentId ?? null)
            : null,
    }

    try {
        // 1) Главная картинка.
        if (pendingFile.value) {
            const media = await uploadMedia(pendingFile.value)
            data.image = media.id
        } else if (imageCleared.value) {
            data.image = null
        }

        // 2) Дополнительная картинка (храним в gallery).
        if (pendingSecondaryFile.value) {
            const media = await uploadMedia(pendingSecondaryFile.value)
            data.gallery = [media.id]
        } else if (secondaryCleared.value) {
            data.gallery = []
        }

        if (isNew.value) {
            await Products.create(data as any)
            toast.add({ severity: 'success', summary: 'Создано', life: 1800 })
            router.push('/catalog/products')
        } else {
            await Products.update(form.documentId, data as any)
            toast.add({ severity: 'success', summary: 'Сохранено', life: 1800 })
            // Перечитываем из API (ищем по documentId, т.к. id в Strapi 5 мог пересоздаться)
            const refreshed = await Products.list({
                'filters[documentId][$eq]': form.documentId,
                populate: ['category', 'image', 'gallery'],
                'pagination[pageSize]': 1,
            })
            const fresh = refreshed[0]
            if (fresh) {
                product.value = fresh
                form.id = fresh.id  // id мог измениться
                mainImage.value = mediaUrl(fresh.image?.url)
                secondaryImage.value = mediaUrl(fresh.gallery?.[0]?.url)
            }
            pendingFile.value = null
            imageCleared.value = false
            pendingSecondaryFile.value = null
            secondaryCleared.value = false
            mode.value = 'view'
        }
    } catch (e: any) {
        toast.add({
            severity: 'error', summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message,
            life: 3500,
        })
    }
}

function cancelEdit() {
    if (!product.value) {
        router.back()
        return
    }
    const p = product.value
    Object.assign(form, {
        id: p.id, documentId: p.documentId,
        name: p.name, slug: p.slug,
        categoryId: p.category?.id ?? null,
        price: Number(p.price),
        weight: p.weight || 350,
        description: p.description || '',
        composition: toArr(p.composition),
        available: p.available,
    })
    mode.value = 'view'
}

async function remove() {
    if (!product.value) return
    if (!confirm(`Удалить товар «${product.value.name}»? Это действие необратимо.`)) return
    try {
        await Products.remove(product.value.documentId)
        toast.add({ severity: 'success', summary: 'Удалено', life: 1800 })
        router.push('/catalog/products')
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}
</script>

<template>
    <AppTopbar
        :title="isNew ? 'Новый продукт' : (product?.name || 'Карточка')"
        :subtitle="isNew ? 'Заполните карточку товара'
                 : mode === 'edit' ? 'Редактирование карточки' : 'Карточка товара'"
        :back="backAction"
    >
        <template #actions>
            <template v-if="mode === 'view' && !isNew">
                <Button icon="pi pi-trash" label="Удалить" severity="danger" outlined @click="remove" />
                <Button icon="pi pi-pencil" label="Редактировать" severity="primary" @click="mode = 'edit'" />
            </template>
            <template v-else>
                <Button label="Отмена" severity="secondary" outlined @click="cancelEdit" />
                <Button :label="isNew ? 'Создать' : 'Сохранить'" icon="pi pi-check"
                        severity="primary" @click="save" />
            </template>
        </template>
    </AppTopbar>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <!-- ============ VIEW MODE ============ -->
    <div v-else-if="mode === 'view' && product" class="p-8 flex flex-col gap-6">
        <!-- Верхний ряд: главная карточка слева, два блока справа -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <!-- Главная карточка -->
            <div class="bg-white rounded-2xl p-6 flex flex-col items-center text-center gap-4">
                <div class="h-[220px] flex items-center justify-center">
                    <img v-if="mainImage" :src="mainImage" alt=""
                         class="h-[220px] w-[220px] object-cover rounded-full"
                         style="box-shadow: 0 0 0 10px rgba(255,255,255,0.65), 0 20px 30px -14px rgba(60,20,0,0.5);" />
                    <SoupPuck v-else :slug="product.slug" :size="200" />
                </div>
                <!-- Доп. картинка (gallery[0]) — маленьким кружком под главной -->
                <div v-if="secondaryImage" class="flex items-center gap-2 text-xs text-ink-400">
                    <img :src="secondaryImage" alt=""
                         class="size-10 object-cover rounded-full border-2 border-white"
                         style="box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
                    <span>+1 картинка</span>
                </div>
                <div class="flex gap-1.5 flex-wrap justify-center">
                    <span v-if="product.tags?.includes('хит')"
                          class="bg-ink-900 text-saffron-300 text-[11px] font-bold tracking-wider px-2 py-1 rounded-full">ХИТ</span>
                    <span v-if="product.pricing?.discountPercent"
                          class="bg-tomato-500 text-white text-[11px] font-bold px-2 py-1 rounded-full">
                        −{{ product.pricing.discountPercent }}%
                    </span>
                    <span v-for="t in (product.tags || []).filter((x) => !['хит'].includes(x))" :key="t"
                          class="bg-ink-100 text-ink-500 text-[11px] font-semibold px-2 py-1 rounded-full">{{ t }}</span>
                    <span v-if="!product.available"
                          class="bg-ink-200 text-ink-500 text-[11px] font-semibold px-2 py-1 rounded-full">Скрыт</span>
                </div>
                <div>
                    <div class="font-display font-extrabold text-2xl">{{ product.name }}</div>
                    <div class="text-sm text-ink-400 mt-1">{{ product.weight }} г · {{ product.category?.name }}</div>
                </div>
                <div class="flex items-baseline gap-3">
                    <div class="font-display font-extrabold text-3xl text-tomato-500">
                        {{ fmt(Number(product.pricing?.finalPrice ?? product.price)) }}
                    </div>
                    <div v-if="product.pricing?.discountPercent" class="text-sm text-ink-400 line-through">
                        {{ fmt(Number(product.pricing.basePrice)) }}
                    </div>
                </div>
                <div v-if="product.pricing?.discountPercent"
                     class="w-full rounded-xl bg-gradient-to-r from-tomato-500 to-tomato-600 text-white p-4 relative overflow-hidden text-left">
                    <div class="absolute -right-6 -top-6 size-24 rounded-full bg-white/10"></div>
                    <div class="absolute -right-10 -bottom-10 size-28 rounded-full bg-white/5"></div>
                    <div class="relative">
                        <div class="flex items-center gap-2">
                            <span class="bg-white/20 backdrop-blur text-white font-extrabold text-[11px] tracking-wider uppercase px-2.5 py-1 rounded-full">
                                −{{ product.pricing.discountPercent }}%
                            </span>
                            <span v-if="product.pricing.label" class="text-sm font-semibold truncate">
                                {{ product.pricing.label }}
                            </span>
                        </div>
                        <div class="mt-2 font-display font-extrabold text-2xl leading-none">
                            {{ fmt(Number(product.pricing.finalPrice)) }}
                        </div>
                        <div class="mt-1 text-[12px] opacity-90">
                            <span class="line-through">{{ fmt(Number(product.pricing.basePrice)) }}</span>
                            · экономия {{ fmt(Number(product.pricing.basePrice) - Number(product.pricing.finalPrice)) }}
                        </div>
                        <div v-if="product.pricing.endsAt" class="mt-2 text-[12px] opacity-90 flex items-center gap-1">
                            <i class="pi pi-clock text-[11px]"></i>
                            Действует до {{ new Date(product.pricing.endsAt).toLocaleDateString('ru-RU') }}
                        </div>
                        <div v-else class="mt-2 text-[12px] opacity-80 flex items-center gap-1">
                            <i class="pi pi-infinity text-[11px]"></i>
                            Без ограничения по сроку
                        </div>
                    </div>
                </div>
            </div>

            <!-- Два блока справа -->
            <div class="flex flex-col gap-6">
                <div v-if="product.description || product.composition" class="bg-white rounded-2xl p-6 space-y-4">
                    <div v-if="product.description">
                        <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Описание</div>
                        <p class="mt-1 text-ink-700 leading-relaxed">{{ product.description }}</p>
                    </div>
                    <div v-if="toArr(product.composition).length">
                        <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Состав</div>
                        <ul class="mt-2 flex flex-wrap gap-1.5">
                            <li v-for="(ing, idx) in toArr(product.composition)" :key="idx"
                                class="rounded-full bg-ink-50 text-ink-700 text-sm px-3 py-1 font-medium">
                                {{ ing }}
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="bg-white rounded-2xl p-6 space-y-3 text-sm">
                    <div class="flex justify-between">
                        <span class="text-ink-400">Slug</span>
                        <code class="text-xs bg-ink-50 px-2 py-0.5 rounded">{{ product.slug }}</code>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-ink-400">ID</span>
                        <span>#{{ product.id }}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                        <span class="text-ink-400">documentId</span>
                        <code class="text-[10px] bg-ink-50 px-2 py-0.5 rounded truncate max-w-[220px]"
                              :title="product.documentId">{{ product.documentId }}</code>
                    </div>
                </div>
            </div>
        </div>

        <!-- Статистика + заказы + наборы: во всю ширину -->
        <div class="space-y-6">
            <!-- Period picker -->
            <PeriodPicker v-model="periodRange"
                          :periods="['null', 'year', 'month', 'week', 'other']" />

            <!-- KPI -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Продано</div>
                    <div class="font-display font-extrabold text-2xl mt-2">{{ stats.sold }} шт.</div>
                </div>
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Выручка</div>
                    <div class="font-display font-extrabold text-2xl mt-2">{{ fmt(stats.revenue) }}</div>
                </div>
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Заказов</div>
                    <div class="font-display font-extrabold text-2xl mt-2">{{ stats.orders }}</div>
                </div>
                <div class="bg-white rounded-2xl p-5">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Клиентов</div>
                    <div class="font-display font-extrabold text-2xl mt-2">{{ stats.clients }}</div>
                </div>
            </div>

            <!-- Sparkline -->
            <div class="bg-white rounded-2xl p-6">
                <div class="flex items-end justify-between mb-3">
                    <div>
                        <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Динамика продаж</div>
                        <div class="text-sm text-ink-400 mt-1">
                            {{ periodRange
                                ? `${periodRange[0].toLocaleDateString('ru-RU')} — ${periodRange[1].toLocaleDateString('ru-RU')}`
                                : 'за всё время' }}
                        </div>
                    </div>
                    <div class="text-sm text-ink-400">
                        Средний чек <span class="font-semibold text-ink-900">{{ fmt(stats.avg) }}</span>
                    </div>
                </div>
                <div v-if="!stats.sold" class="text-sm text-ink-400 py-6 text-center">
                    Пока нет продаж.
                </div>
                <div v-else class="flex items-end gap-0.5 h-24">
                    <div v-for="(h, i) in sparkline" :key="i"
                         class="flex-1 bg-tomato-500 rounded-sm transition-all"
                         :style="{ height: Math.max(2, h) + '%', opacity: 0.35 + h / 150 }"
                         :title="`${h}%`"></div>
                </div>
                <div v-if="stats.sold" class="mt-3 flex justify-between text-xs text-ink-400">
                    <span>{{ fmtDate(stats.first) }}</span>
                    <span>{{ fmtDate(stats.last) }}</span>
                </div>
            </div>

            <!-- In sets -->
            <div class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold text-lg mb-3">Входит в наборы</div>
                <div v-if="!inSets.length" class="text-sm text-ink-400">
                    Этот товар не входит ни в один набор.
                </div>
                <div v-else class="space-y-2">
                    <RouterLink v-for="s in inSets" :key="s.id" :to="`/catalog/sets`"
                                class="flex items-center justify-between py-2 border-b border-ink-100 last:border-0 text-ink-900 no-underline">
                        <div>
                            <div class="font-semibold">{{ s.name }}</div>
                            <div class="text-xs text-ink-400">
                                × {{ s.items.find((it) => it.product?.id === product?.id)?.qty || 0 }} в наборе
                            </div>
                        </div>
                        <div class="font-semibold">{{ fmt(Number(s.pricing?.finalPrice ?? 0)) }}</div>
                    </RouterLink>
                </div>
            </div>

            <!-- Recent orders -->
            <div class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold text-lg mb-3">
                    Последние заказы с этим товаром
                    <span class="text-sm font-medium text-ink-400 ml-2">({{ filteredLines.length }})</span>
                </div>
                <div v-if="!recentOrders.length" class="text-sm text-ink-400">
                    Нет заказов за выбранный период.
                </div>
                <div v-else class="space-y-2">
                    <div v-for="(l, idx) in recentOrders" :key="idx"
                         class="flex items-center justify-between py-2 border-b border-ink-100 last:border-0">
                        <div class="min-w-0 flex-1">
                            <div class="font-semibold text-sm truncate">
                                {{ l.order.code }} · {{ l.order.client?.fullName || '—' }}
                            </div>
                            <div class="text-xs text-ink-400">{{ fmtDate(l.order.createdAt) }}</div>
                        </div>
                        <div class="flex items-center gap-3 shrink-0">
                            <span class="font-semibold">× {{ l.qty }}</span>
                            <span class="font-semibold text-ink-900 w-24 text-right">
                                {{ fmt(l.qty * l.price) }}
                            </span>
                            <span class="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                                  :class="statusColor[l.order.status]">
                                {{ statusLabel[l.order.status] }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ============ EDIT MODE ============ -->
    <div v-else class="p-8 flex flex-col gap-6 max-w-[1100px]">
        <!-- 1. Фотография первой -->
        <div class="bg-white rounded-2xl p-6 flex gap-6 items-start flex-wrap">
            <div class="w-[180px] shrink-0">
                <ImageUploader v-model="mainImage" @file="onFile"
                               aspect="square" label="Главная картинка" />
            </div>
            <div class="w-[180px] shrink-0">
                <ImageUploader v-model="secondaryImage" @file="onSecondaryFile"
                               aspect="square" label="Доп. картинка" />
            </div>
            <div class="flex-1 min-w-[200px]">
                <div class="font-display font-bold">Фотографии</div>
                <p class="text-sm text-ink-400 mt-1 leading-snug">
                    Главная картинка — обложка карточки. Дополнительная показывается в галерее товара.
                    JPG, PNG, WebP. Файлы загрузятся при нажатии «Сохранить».
                </p>
            </div>
        </div>

        <!-- 2. Основное + Цена: две колонки -->
        <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
            <div class="bg-white rounded-2xl p-6 space-y-4">
                <div class="font-display font-bold">Основное</div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                    <input v-model="form.name"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Slug</label>
                        <input v-model="form.slug"
                               class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    </div>
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Категория</label>
                        <select v-model="form.categoryId"
                                class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900 bg-white">
                            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Короткое описание</label>
                    <textarea v-model="form.description" rows="2"
                              class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900"></textarea>
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Состав</label>
                    <InputChips
                        v-model="form.composition"
                        addOnBlur
                        separator=","
                        placeholder="Введите ингредиент и Enter"
                        class="mt-1 w-full composition-chips"
                        :pt="{ root: { class: 'w-full' }, container: { class: 'w-full rounded-xl border border-ink-200 px-3 py-2' } }"
                    />
                    <p class="mt-1.5 text-[11px] text-ink-400">
                        Нажмите Enter или запятую после каждого ингредиента. Клик по × в чипе — удалить.
                    </p>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-6 space-y-4 h-fit">
                <div class="font-display font-bold">Цена и вес</div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Цена</label>
                    <!-- Для нового товара — обычный инпут (создаёт первую запись).
                         Для существующего — только отображение; смена цены — через модалку «Изменить цену» ниже. -->
                    <input v-if="isNew"
                           v-model.number="form.price" type="number"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    <div v-else class="mt-1 w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 font-extrabold text-lg">
                        {{ new Intl.NumberFormat('ru-RU').format(currentPrice?.amount ?? form.price) }}
                        <span class="text-ink-400 font-semibold text-sm">сум</span>
                    </div>
                </div>

                <!-- Скидки на товар управляются в разделе «Скидки». -->
                <RouterLink to="/discounts"
                            class="block w-full rounded-xl border-2 border-dashed border-ink-200 hover:border-ink-400 text-ink-500 font-semibold text-sm py-3 text-center transition">
                    Скидки на товар — в разделе «Скидки»
                </RouterLink>

                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Вес, г</label>
                    <input v-model.number="form.weight" type="number"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                </div>
                <label class="inline-flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" v-model="form.available" class="size-5" />
                    В продаже
                </label>

                <!-- История и план цен (только для существующего товара). -->
                <div v-if="!isNew" class="pt-4 border-t border-ink-100 space-y-3">
                    <div class="flex items-center justify-between gap-2">
                        <div class="font-display font-bold text-sm">Цены — история и план</div>
                        <Button label="Изменить цену" icon="pi pi-pencil" size="small"
                                severity="primary" @click="openPriceDialog" />
                    </div>

                    <div v-if="pricesLoading" class="text-xs text-ink-400">Загрузка…</div>

                    <!-- Плановые цены (в будущем) -->
                    <div v-if="futurePrices.length" class="space-y-1.5">
                        <div class="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                            Плановые
                        </div>
                        <ul class="space-y-1.5 list-none m-0 p-0">
                            <li v-for="p in futurePrices" :key="p.id"
                                class="flex items-center gap-2 rounded-xl bg-cream-50 border border-ink-100 px-3 py-2">
                                <div class="flex-1 min-w-0">
                                    <div class="font-extrabold text-sm">{{ fmtMoney(p.amount) }}</div>
                                    <div class="text-[11px] text-ink-500">
                                        с {{ fmtDateTime(p.validFrom) }}<span v-if="p.comment"> · {{ p.comment }}</span>
                                    </div>
                                </div>
                                <button type="button" @click="confirmCancelFuture(p)"
                                        class="shrink-0 size-8 rounded-lg hover:bg-tomato-50 text-tomato-600 flex items-center justify-center"
                                        aria-label="Отменить плановую цену">
                                    <i class="pi pi-trash text-xs"></i>
                                </button>
                            </li>
                        </ul>
                    </div>

                    <!-- Прошлые цены -->
                    <div v-if="pastPrices.length" class="space-y-1.5">
                        <div class="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                            История
                        </div>
                        <ul class="space-y-1 list-none m-0 p-0 max-h-48 overflow-y-auto">
                            <li v-for="p in pastPrices" :key="p.id"
                                class="flex items-start gap-2 text-sm px-3 py-1.5 border-l-2 border-ink-200">
                                <div class="flex-1 min-w-0">
                                    <div class="font-semibold text-ink-700">{{ fmtMoney(p.amount) }}</div>
                                    <div class="text-[11px] text-ink-400">
                                        {{ fmtDateTime(p.validFrom) }} — {{ fmtDateTime(p.validTo) }}
                                        <span v-if="p.comment"> · {{ p.comment }}</span>
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div v-if="!pricesLoading && !futurePrices.length && !pastPrices.length"
                         class="text-xs text-ink-400">
                        Пока только текущая цена. Нажмите «Изменить цену», чтобы создать новую запись.
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Модалка «Изменить цену» -->
    <Dialog v-model:visible="priceDialog" modal dismissableMask
            header="Изменить цену" :style="{ width: '460px' }">
        <div class="space-y-4">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">
                    Новая цена, сум
                </label>
                <input v-model.number="priceDraft.amount" type="number" min="1" step="500"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 font-extrabold text-lg focus:outline-none focus:border-ink-900" />
            </div>

            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">
                    С какого момента
                </label>
                <div class="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" @click="priceDraft.startWhen = 'now'"
                            class="rounded-xl px-4 py-3 text-sm font-extrabold border transition"
                            :class="priceDraft.startWhen === 'now'
                                ? 'bg-ink-900 text-cream-50 border-ink-900'
                                : 'bg-white border-ink-200 text-ink-700 hover:border-ink-400'">
                        Сейчас
                    </button>
                    <button type="button" @click="priceDraft.startWhen = 'later'"
                            class="rounded-xl px-4 py-3 text-sm font-extrabold border transition"
                            :class="priceDraft.startWhen === 'later'
                                ? 'bg-ink-900 text-cream-50 border-ink-900'
                                : 'bg-white border-ink-200 text-ink-700 hover:border-ink-400'">
                        Запланировать
                    </button>
                </div>
                <div v-if="priceDraft.startWhen === 'later'" class="mt-3">
                    <DatePicker v-model="priceDraft.futureDate" show-time hour-format="24"
                                :min-date="new Date()" date-format="dd.mm.yy"
                                placeholder="Дата и время старта" class="w-full" />
                </div>
            </div>

            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">
                    Комментарий (необязательно)
                </label>
                <input v-model="priceDraft.comment" type="text" placeholder="Повышение поставщика / акция и т. п."
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" text @click="priceDialog = false" />
            <Button label="Сохранить" icon="pi pi-check" severity="primary"
                    :loading="priceDraft.saving" @click="submitPriceChange" />
        </template>
    </Dialog>

</template>
