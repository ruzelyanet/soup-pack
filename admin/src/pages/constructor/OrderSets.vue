<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'
import AppTopbar from '@/components/AppTopbar.vue'
import OrderSetEditor from './OrderSetEditor.vue'
import { OrderSets, Products, type OrderSet, type OrderSetItem, type Product } from '@/services/resources'
import { mediaUrl } from '@/services/api'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'

const list = ref<OrderSet[]>([])
const products = ref<Product[]>([])
const loading = ref(true)
const err = ref<string | null>(null)
const router = useRouter()

// Состояние редактора-сайдбара.
const editorOpen = ref(false)
const editing = ref<OrderSet | null>(null)

const page = ref(0)
const pageSize = ref(PAGE_SIZE)
const total = ref(0)

async function reload() {
    loading.value = true
    err.value = null
    try {
        const [s, p] = await Promise.all([
            // Strapi 5: id пересоздаётся при update, поэтому сортируем по стабильному полю.
            // populate с image, чтобы показать превью продуктов в наборе.
            OrderSets.listPaged({
                populate: { items: { populate: { product: { populate: ['image'] } } }, banner: true },
                sort: 'createdAt:desc',
                'pagination[page]': page.value + 1,
                'pagination[pageSize]': pageSize.value,
            }),
            products.value.length ? Promise.resolve({ data: products.value } as any)
                                  : Products.list({ populate: ['image'], sort: 'name:asc' }).then((d) => ({ data: d })),
        ])
        list.value = s.data
        total.value = s.meta.pagination.total
        products.value = (p as any).data
    } catch (e: any) {
        err.value = e?.response?.status
            ? `${e.response.status} ${e.response.statusText}: ${e?.response?.data?.error?.message || ''}`
            : 'Нет связи с API — запустите backend (cd backend && npm run develop)'
    } finally {
        loading.value = false
    }
}
onMounted(reload)
watch([page, pageSize], reload)

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}

function fmtDate(v: string | undefined) {
    if (!v) return ''
    const d = new Date(v)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function itemsSummary(items: OrderSet['items']) {
    return items.map((i) => `${i.product?.name || '?'} × ${i.qty}`).join(', ')
}
function itemImg(it: OrderSetItem): string {
    return mediaUrl(it.product?.image?.url)
}

function openNew() {
    editing.value = null
    editorOpen.value = true
}
function openCard(row: OrderSet) {
    router.push({ name: 'set-card', params: { documentId: row.documentId } })
}
</script>

<template>
    <AppTopbar title="Конструктор заказов" subtitle="Готовые наборы в каталоге">
        <template #actions>
            <Button icon="pi pi-plus" label="Набор" severity="primary" rounded @click="openNew" />
        </template>
    </AppTopbar>

    <div class="p-8">
        <div v-if="err" class="mb-4 bg-tomato-500/10 text-tomato-600 rounded-xl p-4 text-sm">
            {{ err }}
        </div>
        <div class="bg-white rounded-2xl overflow-hidden">
            <DataTable :value="list" :loading="loading" data-key="id"
                       lazy paginator
                       :rows="pageSize" :first="page * pageSize"
                       :total-records="total"
                       :rows-per-page-options="PAGE_SIZE_OPTIONS"
                       :paginator-template="PAGINATOR_TEMPLATE"
                       :current-page-report-template="PAGINATOR_REPORT"
                       @page="(ev: any) => { page = ev.page; pageSize = ev.rows }">
                <Column header="Название">
                    <template #body="{ data }">
                        <div class="flex items-center gap-3">
                            <!-- Всегда 3 кружка в стопке, +N (если нужен) занимает один из этих трёх -->
                            <div class="flex shrink-0">
                                <!-- Сколько РЕАЛЬНЫХ картинок показывать: 3, если всё помещается, иначе 2 -->
                                <template v-for="idx in Math.min(3, data.items.length > 3 ? 2 : data.items.length)" :key="idx">
                                    <div
                                        class="size-9 rounded-full overflow-hidden bg-ink-100 text-ink-500 flex items-center justify-center text-[10px] font-bold"
                                        :class="idx > 1 ? '-ml-2.5' : ''"
                                        :style="`box-shadow: 0 0 0 2px white; z-index: ${4 - idx};`">
                                        <img v-if="itemImg(data.items[idx - 1])"
                                             :src="itemImg(data.items[idx - 1])"
                                             :alt="data.items[idx - 1].product?.name"
                                             class="w-full h-full object-cover" />
                                        <span v-else>
                                            {{ (data.items[idx - 1].product?.name || '?').slice(0, 2).toUpperCase() }}
                                        </span>
                                    </div>
                                </template>

                                <!-- Чип +N: занимает один из 3 слотов -->
                                <div v-if="data.items.length > 3"
                                     class="size-9 rounded-full -ml-2.5 flex items-center justify-center bg-ink-900 text-cream-50 text-[10px] font-bold"
                                     style="box-shadow: 0 0 0 2px white; z-index: 0;">
                                    +{{ data.items.length - 2 }}
                                </div>

                                <!-- Пустые placeholder-слоты до 3 всего (чтобы ширина не плясала) -->
                                <template v-for="n in Math.max(0, 3 - (data.items.length > 3 ? 3 : data.items.length))" :key="`empty-${n}`">
                                    <div
                                        class="size-9 rounded-full bg-ink-50 border border-dashed border-ink-200 -ml-2.5"
                                        style="box-shadow: 0 0 0 2px white; z-index: 0;">
                                    </div>
                                </template>
                            </div>
                            <router-link
                                :to="{ name: 'set-card', params: { documentId: data.documentId } }"
                                class="font-semibold text-ink-900 hover:text-primary-500 no-underline hover:underline">
                                {{ data.name }}
                            </router-link>
                        </div>
                    </template>
                </Column>
                <Column header="Товары">
                    <template #body="{ data }">
                        <div class="text-xs text-ink-500 select-text">{{ itemsSummary(data.items || []) }}</div>
                    </template>
                </Column>
                <Column header="Цена" style="width: 180px">
                    <template #body="{ data }">
                        <div class="font-semibold">{{ fmt(Number(data.pricing?.finalPrice || 0)) }}</div>
                        <div v-if="data.pricing?.discountPercent"
                             class="text-xs line-through text-ink-400">
                            {{ fmt(Number(data.pricing.basePrice)) }}
                        </div>
                    </template>
                </Column>
                <Column header="Статус" style="width: 170px">
                    <template #body="{ data }">
                        <span class="inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold"
                              :class="data.publishedAt ? 'bg-olive-500/15 text-olive-600' : 'bg-yellow-500/15 text-yellow-700'">
                            {{ data.publishedAt ? 'Опубликован' : 'Не опубликован' }}
                        </span>
                    </template>
                </Column>
                <Column header="В каталоге" style="width: 120px">
                    <template #body="{ data }">
                        <span class="text-xs" :class="data.showInCatalog ? 'text-olive-600' : 'text-ink-400'">
                            {{ data.showInCatalog ? 'Показан' : 'Скрыт' }}
                        </span>
                    </template>
                </Column>
                <Column header="Создан" style="width: 120px">
                    <template #body="{ data }">
                        <div class="text-xs text-ink-500">{{ fmtDate(data.createdAt) }}</div>
                    </template>
                </Column>
                <Column style="width: 70px">
                    <template #body="{ data }">
                        <Button icon="pi pi-arrow-right" text severity="secondary"
                                aria-label="Открыть карточку"
                                @click.stop="openCard(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <OrderSetEditor v-model:visible="editorOpen" :set="editing" :products="products" @saved="reload" />
</template>
