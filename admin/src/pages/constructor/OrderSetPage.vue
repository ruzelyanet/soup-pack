<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import PeriodPicker from '@/components/PeriodPicker.vue'
import { OrderSets, Orders, Products,
         type OrderSet, type Order, type Product, type Discount } from '@/services/resources'
import { api, mediaUrl } from '@/services/api'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirmSvc = useConfirm()

const set = ref<OrderSet | null>(null)
const orders = ref<Order[]>([])
const products = ref<Product[]>([])
const discounts = ref<Discount[]>([])
const loading = ref(true)
const err = ref<string | null>(null)

const STATUS_LABEL: Record<string, string> = {
    new: 'Новый', accepted: 'Принят', in_progress: 'В работе', done: 'Выполнен', canceled: 'Отменён',
}
const STATUS_COLOR: Record<string, string> = {
    new:         'bg-ink-100 text-ink-600',
    accepted:    'bg-yellow-500/15 text-yellow-700',
    in_progress: 'bg-blue-500/15 text-blue-700',
    done:        'bg-olive-500/15 text-olive-600',
    canceled:    'bg-red-500/15 text-red-600',
}

async function load() {
    loading.value = true
    err.value = null
    try {
        const documentId = String(route.params.documentId)
        const [s, prods] = await Promise.all([
            OrderSets.get(documentId, {
                populate: { items: { populate: { product: { populate: ['image'] } } } },
            }),
            products.value.length ? Promise.resolve(products.value)
                                  : Products.list({ populate: ['image'], sort: 'name:asc' }),
        ])
        set.value = s
        products.value = prods
        const [ordersList, discountsRes] = await Promise.all([
            Orders.list({
                'filters[items][orderSetId][$eq]': s.id,
                populate: ['items'],
                sort: 'createdAt:desc',
                'pagination[pageSize]': 500,
            }),
            // Все set-скидки с их targets. Клиент-side фильтр по orderSet.id ниже —
            // nested-filter по many-to-many в Strapi 5 работает не везде.
            api.get('/staff/discounts', {
                params: {
                    'filters[level][$eq]': 'set',
                    'populate[targets][populate][orderSet]': true,
                    'pagination[pageSize]': 200,
                },
            }).then((r) => (r.data?.data ?? []) as Discount[]).catch(() => [] as Discount[]),
        ])
        orders.value = ordersList
        discounts.value = discountsRes
    } catch (e: any) {
        err.value = e?.response?.data?.error?.message || e.message || 'Не удалось загрузить набор'
    } finally {
        loading.value = false
    }
}
onMounted(load)

/* ───── Click-to-edit для простых полей ───── */
const editingField = ref<string | null>(null)
const draft = ref<string>('')

function startEdit(field: 'name' | 'slug' | 'description', current: string | undefined) {
    editingField.value = field
    draft.value = current ?? ''
    nextTick(() => {
        const el = document.querySelector('[data-edit-input]') as HTMLInputElement | HTMLTextAreaElement | null
        if (el) { el.focus(); if ('select' in el) (el as HTMLInputElement).select() }
    })
}
function cancelEdit() { editingField.value = null; draft.value = '' }
async function commitEdit() {
    if (!set.value || !editingField.value) return
    const field = editingField.value
    const value = draft.value
    editingField.value = null
    // Если ничего не изменилось — не трогаем.
    if ((set.value as any)[field] === value) return
    try {
        await OrderSets.update(set.value.documentId, { [field]: value } as any)
        ;(set.value as any)[field] = value
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1200 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
        await load()
    }
}

/* ───── Состав: qty +/-, удалить, добавить ───── */
async function saveItems() {
    if (!set.value) return
    const payload = (set.value.items || []).map((it) => ({
        product: it.product?.documentId ?? null,
        qty: it.qty,
    }))
    try {
        await OrderSets.update(set.value.documentId, { items: payload } as any)
        // Pricing считается на бэке (findOne клеит pricing), поэтому перечитываем.
        const fresh = await OrderSets.get(set.value.documentId, {
            populate: { items: { populate: { product: { populate: ['image'] } } } },
        })
        if (set.value) {
            set.value.items = fresh.items
            set.value.pricing = fresh.pricing
            set.value.updatedAt = fresh.updatedAt
        }
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1200 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
        await load()
    }
}
function changeQty(index: number, delta: number) {
    if (!set.value?.items) return
    set.value.items[index].qty = Math.max(1, Number(set.value.items[index].qty || 1) + delta)
    saveItems()
}
function removeItem(index: number) {
    if (!set.value?.items) return
    set.value.items.splice(index, 1)
    saveItems()
}

const pickerDialog = ref(false)
const picked = ref<Record<number, boolean>>({})
const availableProducts = computed(() =>
    products.value.filter((p) => !(set.value?.items || []).some((it) => it.product?.id === p.id)),
)
function openPicker() { picked.value = {}; pickerDialog.value = true }
function applyPicked() {
    if (!set.value) return
    for (const [id, yes] of Object.entries(picked.value)) {
        if (!yes) continue
        const p = products.value.find((pp) => pp.id === Number(id))
        if (!p) continue
        set.value.items.push({ product: p as any, qty: 1 })
    }
    pickerDialog.value = false
    saveItems()
}
function productImgUrl(p?: Product | null): string {
    const img = p?.image
    if (!img) return ''
    if (typeof img === 'string') return mediaUrl(img)
    return mediaUrl((img as { url?: string }).url)
}

/* ───── Публикация / удаление ───── */
const publishing = ref(false)
async function togglePublish() {
    if (!set.value || publishing.value) return
    publishing.value = true
    try {
        const path = set.value.publishedAt
            ? `/staff/order-sets/${set.value.documentId}/actions/unpublish`
            : `/staff/order-sets/${set.value.documentId}/actions/publish`
        await api.post(path)
        toast.add({ severity: 'success', summary: set.value.publishedAt ? 'Снят с публикации' : 'Опубликован', life: 1800 })
        await load()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
    } finally {
        publishing.value = false
    }
}

function askDelete() {
    if (!set.value) return
    confirmSvc.require({
        message: `Удалить набор «${set.value.name}»?`,
        header: 'Удаление',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Удалить',
        rejectLabel: 'Отмена',
        acceptClass: 'p-button-danger',
        accept: doDelete,
    })
}
async function doDelete() {
    if (!set.value) return
    try {
        await OrderSets.remove(set.value.documentId)
        toast.add({ severity: 'success', summary: 'Удалён', life: 1800 })
        router.push({ name: 'sets' })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
    }
}

/* ───── Статистика ───── */
/** Период для статистики (по умолчанию последние 30 дней). null = «всё время». */
const periodRange = ref<[Date, Date] | null>(null)
{
    const to = new Date(); to.setHours(23, 59, 59, 999)
    const from = new Date(to); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0)
    periodRange.value = [from, to]
}

const filteredOrders = computed(() => {
    const r = periodRange.value
    if (!r) return orders.value
    const [from, to] = r
    const fromMs = from.getTime(), toMs = to.getTime()
    return orders.value.filter((o) => {
        const t = new Date(o.createdAt).getTime()
        return t >= fromMs && t <= toMs
    })
})

const stats = computed(() => {
    const setId = set.value?.id
    let totalRevenue = 0
    const byStatus: Record<string, { count: number; revenue: number }> = {}
    const orderIds = new Set<number>()
    for (const o of filteredOrders.value) {
        let rev = 0
        for (const line of (o as any).items || []) {
            if (line.orderSetId === setId) rev += Number(line.lineTotal || 0)
        }
        if (rev > 0) {
            totalRevenue += rev
            orderIds.add(o.id)
            const s = (o as any).status || 'new'
            if (!byStatus[s]) byStatus[s] = { count: 0, revenue: 0 }
            byStatus[s].count++
            byStatus[s].revenue += rev
        }
    }
    return { totalCount: orderIds.size, totalRevenue, byStatus }
})

/** Скидки, применимые к ТЕКУЩЕМУ набору. */
const setDiscounts = computed(() => {
    const id = set.value?.id
    if (!id) return []
    return discounts.value.filter((d) =>
        (d.targets || []).some((t) => t.targetType === 'order-set' && t.orderSet?.id === id),
    )
})

const DISCOUNT_STATUS: Record<string, string> = {
    draft: 'Черновик', active: 'Активна', paused: 'Пауза', archived: 'Архив',
}
const DISCOUNT_STATUS_COLOR: Record<string, string> = {
    draft:    'bg-ink-100 text-ink-500',
    active:   'bg-olive-500/15 text-olive-600',
    paused:   'bg-yellow-500/15 text-yellow-700',
    archived: 'bg-ink-100 text-ink-400',
}

function discountLabel(d: Discount): string {
    if (d.benefitType === 'percent') return `−${d.benefitValue}%`
    if (d.benefitType === 'fixed_amount') return `−${new Intl.NumberFormat('ru-RU').format(d.benefitValue)} сум`
    if (d.benefitType === 'fixed_price') return `${new Intl.NumberFormat('ru-RU').format(d.benefitValue)} сум`
    return ''
}

function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' сум' }
function fmtDate(v?: string) { return v ? new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '' }
function fmtDateTime(v?: string) { return v ? new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }
function itemImg(it: any): string { return mediaUrl(it?.product?.image?.url || '') }
function goOrder(o: Order) { router.push({ name: 'order', params: { id: o.id } }) }
</script>

<template>
    <AppTopbar title="Наборы" subtitle="Карточка набора" :back="'/catalog/sets'">
        <template #actions>
            <Button v-if="set" icon="pi pi-trash" label="Удалить" severity="danger" outlined
                    @click="askDelete" />
            <Button v-if="set"
                    :icon="set.publishedAt ? 'pi pi-eye-slash' : 'pi pi-globe'"
                    :label="set.publishedAt ? 'Снять с публикации' : 'Опубликовать'"
                    :severity="set.publishedAt ? 'secondary' : 'primary'"
                    :loading="publishing"
                    @click="togglePublish" />
        </template>
    </AppTopbar>

    <div class="p-8">
        <div v-if="loading" class="text-ink-500">Загрузка…</div>
        <div v-else-if="err" class="text-red-600">{{ err }}</div>

        <template v-else-if="set">
            <!-- Верхний ряд: главная карточка слева, два блока справа -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <!-- Левая колонка: главная карточка + технические данные -->
                <div class="flex flex-col gap-6">
                <div class="bg-white rounded-2xl p-6 flex flex-col items-center text-center gap-4">
                    <!-- Коллаж из картинок товаров -->
                    <div class="h-[220px] flex items-center justify-center relative">
                        <div v-if="set.items?.length" class="flex items-center">
                            <template v-for="(it, idx) in set.items.slice(0, 4)" :key="idx">
                                <div class="size-[96px] rounded-full overflow-hidden bg-ink-50 flex items-center justify-center text-ink-400 text-sm font-bold"
                                     :class="idx > 0 ? '-ml-6' : ''"
                                     :style="`box-shadow: 0 0 0 4px #fff, 0 10px 20px -6px rgba(60,20,0,.3); z-index: ${10 - idx};`">
                                    <img v-if="itemImg(it)" :src="itemImg(it)" :alt="it.product?.name"
                                         class="w-full h-full object-cover" />
                                    <span v-else>{{ (it.product?.name || '?').slice(0, 2).toUpperCase() }}</span>
                                </div>
                            </template>
                            <div v-if="set.items.length > 4"
                                 class="size-[96px] rounded-full -ml-6 flex items-center justify-center bg-ink-900 text-cream-50 font-bold"
                                 style="box-shadow: 0 0 0 4px #fff; z-index: 0;">
                                +{{ set.items.length - 4 }}
                            </div>
                        </div>
                        <div v-else class="size-[160px] rounded-full bg-ink-50 flex items-center justify-center text-ink-300 text-sm italic">
                            нет товаров
                        </div>
                    </div>

                    <!-- Бейджи: статус, скидка -->
                    <div class="flex gap-1.5 flex-wrap justify-center">
                        <span class="inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold"
                              :class="set.publishedAt ? 'bg-olive-500/15 text-olive-600' : 'bg-yellow-500/15 text-yellow-700'">
                            {{ set.publishedAt ? 'Опубликован' : 'Не опубликован' }}
                        </span>
                        <span v-if="set.pricing?.discountPercent"
                              class="bg-tomato-500 text-white text-[11px] font-bold px-2 py-1 rounded-full">
                            −{{ set.pricing.discountPercent }}%
                        </span>
                        <span class="bg-ink-100 text-ink-500 text-[11px] font-semibold px-2 py-1 rounded-full">
                            {{ set.items?.length || 0 }} поз. · {{ set.items?.reduce((s, it) => s + Number(it.qty || 0), 0) || 0 }} шт.
                        </span>
                    </div>

                    <!-- Имя набора — click-to-edit -->
                    <div class="w-full">
                        <template v-if="editingField === 'name'">
                            <input v-model="draft" data-edit-input
                                   @blur="commitEdit" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="cancelEdit"
                                   class="w-full text-center font-display font-extrabold text-2xl rounded-lg border border-ink-300 px-3 py-1 focus:outline-none focus:border-ink-900" />
                        </template>
                        <div v-else
                             class="font-display font-extrabold text-2xl cursor-text hover:bg-ink-50 rounded-lg px-2 py-1 transition"
                             @click="startEdit('name', set.name)">
                            {{ set.name }}
                        </div>
                    </div>

                    <!-- Цена -->
                    <div class="flex items-baseline gap-3">
                        <div class="font-display font-extrabold text-3xl text-tomato-500">
                            {{ fmt(Number(set.pricing?.finalPrice || 0)) }}
                        </div>
                        <div v-if="set.pricing?.discountPercent" class="text-sm text-ink-400 line-through">
                            {{ fmt(Number(set.pricing.basePrice)) }}
                        </div>
                    </div>

                    <!-- Описание — click-to-edit под ценой -->
                    <div class="w-full pt-4 border-t border-ink-100 text-left">
                        <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-1.5">Описание</div>
                        <div v-if="editingField === 'description'">
                            <textarea v-model="draft" data-edit-input rows="4"
                                      @blur="commitEdit" @keydown.esc="cancelEdit"
                                      class="w-full rounded-xl border border-ink-300 px-4 py-3 focus:outline-none focus:border-ink-900 text-sm"></textarea>
                        </div>
                        <div v-else class="text-sm text-ink-700 leading-relaxed cursor-text hover:bg-ink-50 rounded-lg px-3 -mx-3 py-2 transition"
                             @click="startEdit('description', set.description)">
                            <span v-if="set.description" class="whitespace-pre-line">{{ set.description }}</span>
                            <span v-else class="text-ink-400 italic">Без описания — кликните чтобы добавить</span>
                        </div>
                    </div>
                </div>

                <!-- Технические данные -->
                <div class="bg-white rounded-2xl p-6 space-y-3 text-sm">
                    <div class="flex justify-between items-center gap-2">
                        <span class="text-ink-400">Slug</span>
                        <template v-if="editingField === 'slug'">
                            <input v-model="draft" data-edit-input
                                   @blur="commitEdit" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="cancelEdit"
                                   class="font-mono text-xs rounded border border-ink-300 px-2 py-0.5 focus:outline-none focus:border-ink-900 min-w-[200px]" />
                        </template>
                        <code v-else class="text-xs bg-ink-50 px-2 py-0.5 rounded cursor-text hover:bg-ink-100 transition"
                              @click="startEdit('slug', set.slug)">{{ set.slug || '—' }}</code>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-ink-400">ID</span>
                        <span>#{{ set.id }}</span>
                    </div>
                    <div class="flex justify-between gap-2">
                        <span class="text-ink-400">documentId</span>
                        <code class="text-[10px] bg-ink-50 px-2 py-0.5 rounded truncate max-w-[220px]"
                              :title="set.documentId">{{ set.documentId }}</code>
                    </div>
                    <div class="flex justify-between text-xs text-ink-500 pt-2 border-t border-ink-100">
                        <span>Создан</span>
                        <span>{{ fmtDate(set.createdAt) }}</span>
                    </div>
                    <div v-if="set.updatedAt" class="flex justify-between text-xs text-ink-500">
                        <span>Обновлён</span>
                        <span>{{ fmtDate(set.updatedAt) }}</span>
                    </div>
                </div>
                </div>

                <!-- Правая колонка: состав -->
                <div class="flex flex-col gap-6">
                    <!-- Состав -->
                    <div class="bg-white rounded-2xl p-6">
                        <div class="flex items-center justify-between mb-4">
                            <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Состав</div>
                            <Button icon="pi pi-plus" label="Добавить" size="small" severity="primary"
                                    @click="openPicker" />
                        </div>
                        <div v-if="!set.items?.length" class="text-ink-400 italic text-sm py-4 text-center">
                            Пусто — нажмите «Добавить».
                        </div>
                        <div v-else class="grid grid-cols-4 gap-3">
                            <div v-for="(it, i) in set.items" :key="i"
                                 class="relative bg-white border border-ink-200 rounded-2xl p-3 flex flex-col gap-2">
                                <button type="button" aria-label="Убрать" @click="removeItem(i)"
                                        class="absolute top-2 right-2 size-7 rounded-full bg-ink-50 hover:bg-tomato-500 hover:text-white text-ink-500 flex items-center justify-center transition z-10">
                                    <i class="pi pi-times text-xs"></i>
                                </button>
                                <div class="aspect-square rounded-xl overflow-hidden bg-ink-50 flex items-center justify-center">
                                    <img v-if="itemImg(it)" :src="itemImg(it)" :alt="it.product?.name"
                                         class="w-full h-full object-cover" />
                                    <span v-else class="text-ink-300 text-xl font-bold">
                                        {{ (it.product?.name || '?').slice(0, 2).toUpperCase() }}
                                    </span>
                                </div>
                                <div class="font-semibold text-[13px] leading-tight line-clamp-2 min-h-[32px]">
                                    {{ it.product?.name || '—' }}
                                </div>
                                <div class="flex items-center bg-tomato-500 text-white rounded-full h-8 self-stretch">
                                    <button type="button" aria-label="Меньше"
                                            class="w-8 h-8 text-white font-extrabold text-[14px]"
                                            @click="changeQty(i, -1)">−</button>
                                    <span class="flex-1 text-center font-extrabold text-sm">{{ it.qty }}</span>
                                    <button type="button" aria-label="Больше"
                                            class="w-8 h-8 text-white font-extrabold text-[14px]"
                                            @click="changeQty(i, 1)">+</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Статистика продаж — под составом -->
                    <div class="bg-white rounded-2xl p-6">
                        <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
                            <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Статистика продаж</div>
                            <PeriodPicker v-model="periodRange" />
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="rounded-xl bg-ink-50 p-3">
                                <div class="text-[11px] text-ink-400">Заказов</div>
                                <div class="text-xl font-black mt-0.5">{{ stats.totalCount }}</div>
                            </div>
                            <div class="rounded-xl bg-ink-50 p-3">
                                <div class="text-[11px] text-ink-400">Выручка</div>
                                <div class="text-xl font-black mt-0.5">{{ fmt(stats.totalRevenue) }}</div>
                            </div>
                        </div>
                        <div v-if="Object.keys(stats.byStatus).length" class="mt-3 flex flex-wrap gap-2">
                            <div v-for="(v, k) in stats.byStatus" :key="k"
                                 class="inline-flex items-center gap-2 bg-ink-50 rounded-full pl-2 pr-3 py-1">
                                <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                      :class="STATUS_COLOR[k] || 'bg-ink-100 text-ink-600'">
                                    {{ STATUS_LABEL[k] || k }}
                                </span>
                                <span class="text-xs">{{ v.count }}</span>
                                <span class="text-xs text-ink-400">·</span>
                                <span class="text-xs font-semibold">{{ fmt(v.revenue) }}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- Скидки на этот набор (только отображение; управление в разделе «Скидки») -->
            <div v-if="setDiscounts.length" class="mt-6 bg-white rounded-2xl shadow-sm p-5">
                <h2 class="m-0 text-lg font-black mb-3">Скидки на набор</h2>
                <ul class="list-none p-0 m-0 divide-y divide-ink-100">
                    <li v-for="d in setDiscounts" :key="d.id" class="py-3 flex items-center gap-3">
                        <span class="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              :class="DISCOUNT_STATUS_COLOR[d.status] || 'bg-ink-100 text-ink-500'">
                            {{ DISCOUNT_STATUS[d.status] || d.status }}
                        </span>
                        <RouterLink :to="{ name: 'discount', params: { id: d.documentId } }"
                                    class="font-semibold text-ink-900 hover:text-primary-500 no-underline hover:underline">
                            {{ d.name }}
                        </RouterLink>
                        <span v-if="d.publicLabel" class="text-xs text-ink-400">· {{ d.publicLabel }}</span>
                        <div class="flex-1"></div>
                        <span class="text-sm font-bold text-tomato-600 whitespace-nowrap">{{ discountLabel(d) }}</span>
                    </li>
                </ul>
            </div>

            <!-- Заказы -->
            <div class="mt-6 bg-white rounded-2xl shadow-sm p-5">
                <h2 class="m-0 text-lg font-black mb-3">
                    Заказы с набором <span class="text-ink-400 font-normal text-sm">({{ filteredOrders.length }})</span>
                </h2>
                <div v-if="!filteredOrders.length" class="text-ink-400 italic text-sm">
                    В выбранном периоде заказов не было.
                </div>
                <DataTable v-else :value="filteredOrders" data-key="id" :rows="20" paginator
                           @row-click="(e) => goOrder(e.data)"
                           :pt="{ bodyRow: { class: 'cursor-pointer' } }">
                    <Column header="Код" field="code" style="width: 140px" />
                    <Column header="Дата" style="width: 170px">
                        <template #body="{ data }">{{ fmtDateTime(data.createdAt) }}</template>
                    </Column>
                    <Column header="Статус" style="width: 140px">
                        <template #body="{ data }">
                            <span class="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                  :class="STATUS_COLOR[data.status] || 'bg-ink-100 text-ink-600'">
                                {{ STATUS_LABEL[data.status] || data.status }}
                            </span>
                        </template>
                    </Column>
                    <Column header="Сумма заказа" style="width: 150px">
                        <template #body="{ data }">{{ fmt(Number(data.total || 0)) }}</template>
                    </Column>
                </DataTable>
            </div>
        </template>

        <!-- Picker товаров -->
        <Dialog v-model:visible="pickerDialog" modal dismissableMask
                header="Добавить товары в набор"
                :style="{ width: '820px', maxWidth: '95vw' }">
            <div v-if="!availableProducts.length" class="py-10 text-center text-ink-400">
                Все существующие товары уже в наборе.
            </div>
            <template v-else>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
                    <div v-for="p in availableProducts" :key="p.id"
                         @click="picked[p.id] = !picked[p.id]"
                         class="relative bg-white border-2 rounded-2xl p-3 flex flex-col gap-2 cursor-pointer transition"
                         :class="picked[p.id] ? 'border-tomato-500 ring-4 ring-tomato-500/15' : 'border-ink-200 hover:border-ink-400'">
                        <div class="absolute top-2 right-2 size-6 rounded-full flex items-center justify-center transition"
                             :class="picked[p.id] ? 'bg-tomato-500 text-white' : 'bg-white border border-ink-200 text-transparent'">
                            <i class="pi pi-check text-[10px]"></i>
                        </div>
                        <div class="aspect-square rounded-xl overflow-hidden bg-ink-50 flex items-center justify-center">
                            <img v-if="productImgUrl(p)" :src="productImgUrl(p)" :alt="p.name"
                                 class="w-full h-full object-cover" />
                            <span v-else class="text-ink-300 text-xl font-bold">
                                {{ p.name.slice(0, 2).toUpperCase() }}
                            </span>
                        </div>
                        <div class="font-semibold text-[13px] leading-tight line-clamp-2 min-h-[32px]">
                            {{ p.name }}
                        </div>
                        <div class="text-[12px] font-bold text-tomato-600">
                            {{ fmt(Number(p.price)) }}
                        </div>
                    </div>
                </div>
            </template>
            <template #footer>
                <div class="flex gap-2 justify-end w-full">
                    <Button label="Отмена" severity="secondary" outlined @click="pickerDialog = false" />
                    <Button label="Добавить" severity="primary" @click="applyPicked" />
                </div>
            </template>
        </Dialog>
    </div>
</template>
