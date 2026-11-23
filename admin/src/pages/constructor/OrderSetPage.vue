<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { OrderSets, Orders, Products, type OrderSet, type Order, type Product } from '@/services/resources'
import { api, mediaUrl } from '@/services/api'
import OrderSetEditor from './OrderSetEditor.vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const toast = useToast()
const confirmSvc = useConfirm()
const products = ref<Product[]>([])
const editorOpen = ref(false)

const route = useRoute()
const router = useRouter()

const set = ref<OrderSet | null>(null)
const orders = ref<Order[]>([])
const loading = ref(true)
const err = ref<string | null>(null)

const STATUS_LABEL: Record<string, string> = {
    new: 'Новый',
    accepted: 'Принят',
    in_progress: 'В работе',
    done: 'Выполнен',
    canceled: 'Отменён',
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
                populate: { items: { populate: { product: { populate: ['image'] } } }, banner: true },
            }),
            products.value.length ? Promise.resolve(products.value)
                                  : Products.list({ populate: ['image'], sort: 'name:asc' }),
        ])
        set.value = s
        products.value = prods
        const list = await Orders.list({
            'filters[items][orderSetId][$eq]': s.id,
            populate: ['items'],
            sort: 'createdAt:desc',
            'pagination[pageSize]': 500,
        })
        orders.value = list
    } catch (e: any) {
        err.value = e?.response?.data?.error?.message || e.message || 'Не удалось загрузить набор'
    } finally {
        loading.value = false
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
onMounted(load)

/** Выручка по данному набору = сумма lineTotal по строкам с orderSetId == set.id. */
const stats = computed(() => {
    const setId = set.value?.id
    let totalRevenue = 0
    const byStatus: Record<string, { count: number; revenue: number }> = {}
    const orderIds = new Set<number>()
    for (const o of orders.value) {
        let orderLineRevenue = 0
        for (const line of (o as any).items || []) {
            if (line.orderSetId === setId) {
                orderLineRevenue += Number(line.lineTotal || 0)
            }
        }
        if (orderLineRevenue > 0) {
            totalRevenue += orderLineRevenue
            orderIds.add(o.id)
            const s = (o as any).status || 'new'
            if (!byStatus[s]) byStatus[s] = { count: 0, revenue: 0 }
            byStatus[s].count++
            byStatus[s].revenue += orderLineRevenue
        }
    }
    return { totalCount: orderIds.size, totalRevenue, byStatus }
})

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' сум'
}
function fmtDate(v: string | undefined) {
    if (!v) return ''
    return new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(v: string | undefined) {
    if (!v) return ''
    return new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function itemImg(it: any): string {
    return mediaUrl(it?.product?.image?.url || '')
}
function goOrder(o: Order) {
    router.push({ name: 'order', params: { id: o.id } })
}

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
</script>

<template>
    <AppTopbar />
    <div class="px-6 py-6">
        <!-- Header -->
        <div class="flex items-center gap-3 mb-5">
            <Button icon="pi pi-chevron-left" text @click="router.back()" aria-label="Назад" />
            <h1 class="m-0 text-2xl font-black">{{ set?.name || 'Набор' }}</h1>
            <div class="flex-1"></div>
            <span v-if="set" class="rounded-full px-3 py-1 text-xs font-semibold"
                  :class="set.publishedAt ? 'bg-olive-500/15 text-olive-600' : 'bg-yellow-500/15 text-yellow-700'">
                {{ set.publishedAt ? 'Опубликован' : 'Черновик' }}
            </span>
            <span v-if="set" class="rounded-full px-3 py-1 text-xs font-semibold"
                  :class="set.showInCatalog ? 'bg-ink-100 text-ink-600' : 'bg-ink-100 text-ink-400'">
                {{ set.showInCatalog ? 'В каталоге' : 'Скрыт в каталоге' }}
            </span>
            <Button v-if="set"
                    :icon="set.publishedAt ? 'pi pi-eye-slash' : 'pi pi-globe'"
                    :label="set.publishedAt ? 'Снять с публикации' : 'Опубликовать'"
                    :severity="set.publishedAt ? 'secondary' : 'primary'"
                    :loading="publishing"
                    @click="togglePublish" />
            <Button v-if="set" icon="pi pi-pencil" label="Редактировать" severity="secondary"
                    @click="editorOpen = true" />
            <Button v-if="set" icon="pi pi-trash" text severity="danger"
                    aria-label="Удалить" @click="askDelete" />
        </div>

        <div v-if="loading" class="text-ink-500">Загрузка…</div>
        <div v-else-if="err" class="text-red-600">{{ err }}</div>

        <template v-else-if="set">
            <!-- Hero: баннер / описание -->
            <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div v-if="set.banner?.url" class="h-48 overflow-hidden bg-ink-50">
                    <img :src="mediaUrl(set.banner.url)" :alt="set.name" class="w-full h-full object-cover" />
                </div>
                <div class="p-5">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <div v-if="set.description" class="text-ink-600 text-sm">{{ set.description }}</div>
                            <div v-else class="text-ink-400 text-sm italic">Без описания</div>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="text-xs text-ink-400">Цена</div>
                            <div class="text-2xl font-black">{{ fmt(Number(set.pricing?.finalPrice || 0)) }}</div>
                            <div v-if="set.pricing?.discountPercent"
                                 class="text-sm line-through text-ink-400">
                                {{ fmt(Number(set.pricing.basePrice)) }}
                            </div>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center gap-4 text-xs text-ink-500">
                        <span>Создан: {{ fmtDate(set.createdAt) }}</span>
                        <span v-if="set.slug">slug: <code>{{ set.slug }}</code></span>
                    </div>
                </div>
            </div>

            <!-- Состав -->
            <div class="mt-6 bg-white rounded-2xl shadow-sm p-5">
                <h2 class="m-0 text-lg font-black mb-4">Состав набора</h2>
                <div v-if="!set.items?.length" class="text-ink-400 italic">Пусто</div>
                <ul v-else class="list-none p-0 m-0 divide-y divide-ink-100">
                    <li v-for="(it, i) in set.items" :key="i"
                        class="py-3 flex items-center gap-3">
                        <div class="size-12 rounded-xl overflow-hidden bg-ink-50 shrink-0">
                            <img v-if="itemImg(it)" :src="itemImg(it)" :alt="it.product?.name"
                                 class="w-full h-full object-cover" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold truncate">{{ it.product?.name || '—' }}</div>
                            <div class="text-xs text-ink-500">{{ it.qty }} шт.</div>
                        </div>
                    </li>
                </ul>
            </div>

            <!-- Статистика продаж -->
            <div class="mt-6">
                <h2 class="m-0 text-lg font-black mb-3">Статистика продаж</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-white rounded-2xl shadow-sm p-4">
                        <div class="text-xs text-ink-400">Всего заказов</div>
                        <div class="text-2xl font-black mt-1">{{ stats.totalCount }}</div>
                    </div>
                    <div class="bg-white rounded-2xl shadow-sm p-4">
                        <div class="text-xs text-ink-400">Выручка</div>
                        <div class="text-2xl font-black mt-1">{{ fmt(stats.totalRevenue) }}</div>
                    </div>
                    <div v-for="(v, k) in stats.byStatus" :key="k"
                         class="bg-white rounded-2xl shadow-sm p-4">
                        <div class="flex items-center justify-between">
                            <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                  :class="STATUS_COLOR[k] || 'bg-ink-100 text-ink-600'">
                                {{ STATUS_LABEL[k] || k }}
                            </span>
                            <span class="text-xs text-ink-500">{{ v.count }}</span>
                        </div>
                        <div class="text-lg font-black mt-2">{{ fmt(v.revenue) }}</div>
                    </div>
                </div>
            </div>

            <!-- Заказы с этим набором -->
            <div class="mt-6 bg-white rounded-2xl shadow-sm p-5">
                <h2 class="m-0 text-lg font-black mb-3">
                    Заказы с набором <span class="text-ink-400 font-normal text-sm">({{ orders.length }})</span>
                </h2>
                <div v-if="!orders.length" class="text-ink-400 italic">Ещё не было заказов с этим набором.</div>
                <DataTable v-else :value="orders" data-key="id" :rows="20" paginator
                           @row-click="(e) => goOrder(e.data)"
                           :pt="{ bodyRow: { class: 'cursor-pointer' } }">
                    <Column header="Код" field="code" style="width: 140px" />
                    <Column header="Дата" style="width: 160px">
                        <template #body="{ data }">{{ fmtDateTime(data.createdAt) }}</template>
                    </Column>
                    <Column header="Статус" style="width: 140px">
                        <template #body="{ data }">
                            <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
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
    </div>

    <OrderSetEditor v-model:visible="editorOpen" :set="set" :products="products" @saved="load" />
</template>
