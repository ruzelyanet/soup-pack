<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'
import AppTopbar from '@/components/AppTopbar.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import { OrderSets, Products, type OrderSet, type OrderSetItem, type Product } from '@/services/resources'
import { mediaUrl } from '@/services/api'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import DatePicker from 'primevue/datepicker'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const list = ref<OrderSet[]>([])
const products = ref<Product[]>([])
const loading = ref(true)
const err = ref<string | null>(null)
const dialog = ref(false)
const toast = useToast()
// Переименовал в confirmSvc, чтобы не затенять глобальный window.confirm, который используется в remove()
const confirmSvc = useConfirm()

type Draft = {
    documentId: string
    name: string
    slug: string
    description: string
    showInCatalog: boolean
    bannerUrl: string
    linkUrl: string
    items: Array<{ productId: number; qty: number }>
}
const edit = ref<Draft>({
    documentId: '', name: '', slug: '', description: '',
    showInCatalog: true, bannerUrl: '', linkUrl: '', items: [],
})

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
                sort: 'name:asc',
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

function openNew() {
    edit.value = {
        documentId: '', name: '', slug: '', description: '',
        showInCatalog: true, bannerUrl: '', linkUrl: '', items: [],
    }
    dialog.value = true
}

function openEdit(row: OrderSet) {
    edit.value = {
        documentId: row.documentId,
        name: row.name,
        slug: row.slug || '',
        description: row.description || '',
        showInCatalog: row.showInCatalog,
        bannerUrl: row.banner?.url || '',
        linkUrl: row.linkUrl || '',
        items: (row.items || []).map((it) => ({ productId: it.product?.id || 0, qty: it.qty })),
    }
    dialog.value = true
}

function removeItem(idx: number) {
    edit.value.items.splice(idx, 1)
}

/** Найти продукт по id. */
function productOf(id: number): Product | undefined {
    return products.value.find((p) => p.id === id)
}

function productImgUrl(p?: Product | null): string {
    const img = p?.image
    if (!img) return ''
    if (typeof img === 'string') return mediaUrl(img)
    return mediaUrl((img as { url?: string }).url)
}

/* ────── Пикер товаров ────── */
const pickerDialog = ref(false)
const picked = ref<Record<number, boolean>>({})
const pickerPage = ref(0)
const PICKER_PAGE_SIZE = 8

/** Товары, которые ещё НЕ в наборе. */
const availableProducts = computed(() =>
    products.value.filter((p) => !edit.value.items.some((it) => it.productId === p.id)),
)
const pickerTotalPages = computed(() =>
    Math.max(1, Math.ceil(availableProducts.value.length / PICKER_PAGE_SIZE)),
)
const pagedProducts = computed(() =>
    availableProducts.value.slice(
        pickerPage.value * PICKER_PAGE_SIZE,
        (pickerPage.value + 1) * PICKER_PAGE_SIZE,
    ),
)
const pickedCount = computed(() => Object.values(picked.value).filter(Boolean).length)

function openPicker() {
    picked.value = {}
    pickerPage.value = 0
    pickerDialog.value = true
}
function togglePick(id: number) {
    picked.value[id] = !picked.value[id]
}
function applyPicked() {
    for (const [id, yes] of Object.entries(picked.value)) {
        if (yes) edit.value.items.push({ productId: Number(id), qty: 1 })
    }
    pickerDialog.value = false
}

// Скидки на набор управляются в разделе «Скидки» (`level: 'set'`, target на этот order-set).
function itemsSummary(items: OrderSet['items']) {
    return items.map((i) => `${i.product?.name || '?'} × ${i.qty}`).join(', ')
}

/** URL картинки продукта из set-item, если есть. */
function itemImg(it: OrderSetItem): string {
    return mediaUrl(it.product?.image?.url)
}
function computedTotal() {
    return edit.value.items.reduce((s, it) => {
        const p = products.value.find((pp) => pp.id === it.productId)
        return s + Number(p?.price || 0) * it.qty
    }, 0)
}

async function save() {
    const data = {
        name: edit.value.name,
        slug: edit.value.slug || edit.value.name.toLowerCase().replace(/\s+/g, '-'),
        description: edit.value.description,
        showInCatalog: edit.value.showInCatalog,
        linkUrl: edit.value.linkUrl,
        // Strapi 5 REST: relation внутри компонента — короткая форма (documentId строкой).
        items: edit.value.items.map((it) => {
            const p = products.value.find((pp) => pp.id === it.productId)
            return { product: p?.documentId ?? null, qty: it.qty }
        }),
    }
    try {
        if (edit.value.documentId) {
            await OrderSets.update(edit.value.documentId, data as any)
        } else {
            await OrderSets.create(data as any)
        }
        dialog.value = false
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1800 })
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
    }
}

async function remove(row: OrderSet) {
    if (!confirm(`Удалить набор «${row.name}»?`)) return
    await OrderSets.remove(row.documentId)
    await reload()
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
                       @page="(ev: any) => { page = ev.page; pageSize = ev.rows }"
                       @row-click="(e) => openEdit(e.data)"
                       :pt="{ bodyRow: { class: 'cursor-pointer' } }">
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
                            <span class="font-semibold">{{ data.name }}</span>
                        </div>
                    </template>
                </Column>
                <Column header="Товары">
                    <template #body="{ data }">
                        <div class="text-xs text-ink-500">{{ itemsSummary(data.items || []) }}</div>
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
                <Column header="В каталоге" style="width: 140px">
                    <template #body="{ data }">
                        <span class="rounded-full px-3 py-1 text-xs font-semibold"
                              :class="data.showInCatalog ? 'bg-olive-500/15 text-olive-500' : 'bg-ink-100 text-ink-400'">
                            {{ data.showInCatalog ? 'Показан' : 'Скрыт' }}
                        </span>
                    </template>
                </Column>
                <Column style="width: 60px">
                    <template #body="{ data }">
                        <Button icon="pi pi-trash" text severity="danger" @click.stop="remove(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <Dialog v-model:visible="dialog" modal dismissableMask :header="edit.documentId ? 'Редактировать набор' : 'Новый набор'"
            :style="{ width: '720px' }">
        <div class="space-y-5">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                    <input v-model="edit.name" placeholder="Неделька · 3 человека"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Slug</label>
                    <input v-model="edit.slug"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                </div>
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Описание</label>
                <textarea v-model="edit.description" rows="2"
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900"></textarea>
            </div>

            <div class="bg-ink-50 rounded-xl p-4">
                <div class="flex items-center justify-between">
                    <div class="font-semibold">Состав набора</div>
                    <Button icon="pi pi-plus" label="Добавить товары"
                            size="small" severity="primary" @click="openPicker" />
                </div>
                <div v-if="!edit.items.length"
                     class="mt-3 py-6 text-center text-sm text-ink-400 border-2 border-dashed border-ink-200 rounded-xl">
                    Пока пусто — нажмите «Добавить товары».
                </div>
                <div v-else class="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div v-for="(it, idx) in edit.items" :key="idx"
                         class="relative bg-white border border-ink-200 rounded-2xl p-3 flex flex-col gap-2">
                        <button type="button" aria-label="Удалить" @click="removeItem(idx)"
                                class="absolute top-2 right-2 size-7 rounded-full bg-ink-50 hover:bg-tomato-500 hover:text-white text-ink-500 flex items-center justify-center transition z-10">
                            <i class="pi pi-times text-xs"></i>
                        </button>

                        <div class="aspect-square rounded-xl overflow-hidden bg-ink-50 flex items-center justify-center">
                            <img v-if="productImgUrl(productOf(it.productId))"
                                 :src="productImgUrl(productOf(it.productId))"
                                 :alt="productOf(it.productId)?.name"
                                 class="w-full h-full object-cover" />
                            <span v-else class="text-ink-300 text-xl font-bold">
                                {{ (productOf(it.productId)?.name || '?').slice(0, 2).toUpperCase() }}
                            </span>
                        </div>

                        <div class="font-semibold text-[13px] leading-tight line-clamp-2 min-h-[32px]">
                            {{ productOf(it.productId)?.name || '— удалён —' }}
                        </div>
                        <div class="text-[12px] font-bold text-tomato-600">
                            {{ fmt(Number(productOf(it.productId)?.price || 0)) }}
                        </div>

                        <!-- Спиннер в стиле каталога -->
                        <div role="group" aria-label="Количество"
                             class="flex items-center bg-tomato-500 text-white rounded-full h-9 self-stretch">
                            <button type="button" aria-label="Меньше"
                                    class="w-9 h-9 text-white font-extrabold text-[16px]"
                                    @click="it.qty = Math.max(1, it.qty - 1)">−</button>
                            <span class="flex-1 text-center font-extrabold text-sm">{{ it.qty }}</span>
                            <button type="button" aria-label="Больше"
                                    class="w-9 h-9 text-white font-extrabold text-[16px]"
                                    @click="it.qty++">+</button>
                        </div>
                    </div>
                </div>
                <div class="mt-4 flex items-center justify-between pt-3 border-t border-ink-100">
                    <span class="text-sm text-ink-400">
                        Сумма без скидки · {{ edit.items.length }} позиций
                    </span>
                    <span class="font-display font-extrabold">{{ fmt(computedTotal()) }}</span>
                </div>
            </div>

            <!-- Скидки на набор управляются в разделе «Скидки». -->
            <RouterLink to="/discounts"
                        class="block w-full rounded-xl border-2 border-dashed border-ink-200 hover:border-ink-400 text-ink-500 font-semibold text-sm py-3 text-center transition">
                Скидки на набор — в разделе «Скидки»
            </RouterLink>

            <label class="inline-flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" v-model="edit.showInCatalog" class="size-5" />
                Показывать в каталоге
            </label>

            <ImageUploader v-model="edit.bannerUrl" aspect="card" label="Баннер набора для каталога" />
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Ссылка при клике</label>
                <input v-model="edit.linkUrl"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
        </div>

        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="dialog = false" />
            <Button label="Сохранить" severity="primary" @click="save" />
        </template>
    </Dialog>

    <!-- Модалка выбора товаров в набор -->
    <Dialog v-model:visible="pickerDialog" modal dismissableMask
            header="Добавить товары в набор"
            :style="{ width: '820px', maxWidth: '95vw' }">
        <div v-if="!availableProducts.length"
             class="py-10 text-center text-ink-400">
            Все существующие товары уже в наборе.
        </div>
        <template v-else>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div v-for="p in pagedProducts" :key="p.id"
                     @click="togglePick(p.id)"
                     class="relative bg-white border-2 rounded-2xl p-3 flex flex-col gap-2 cursor-pointer transition"
                     :class="picked[p.id]
                        ? 'border-tomato-500 ring-4 ring-tomato-500/15'
                        : 'border-ink-200 hover:border-ink-400'">
                    <div class="absolute top-2 right-2 size-6 rounded-full flex items-center justify-center transition"
                         :class="picked[p.id]
                            ? 'bg-tomato-500 text-white'
                            : 'bg-white border border-ink-200 text-transparent'">
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

            <!-- Пагинация -->
            <div v-if="pickerTotalPages > 1" class="mt-5 flex items-center justify-center gap-2">
                <button type="button" @click="pickerPage = Math.max(0, pickerPage - 1)"
                        :disabled="pickerPage === 0"
                        class="size-9 rounded-xl border border-ink-200 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center">
                    <i class="pi pi-chevron-left text-xs"></i>
                </button>
                <button v-for="n in pickerTotalPages" :key="n" type="button"
                        @click="pickerPage = n - 1"
                        class="size-9 rounded-xl font-bold text-sm transition"
                        :class="pickerPage === n - 1
                            ? 'bg-ink-900 text-white'
                            : 'bg-white border border-ink-200 hover:bg-ink-50 text-ink-700'">
                    {{ n }}
                </button>
                <button type="button" @click="pickerPage = Math.min(pickerTotalPages - 1, pickerPage + 1)"
                        :disabled="pickerPage >= pickerTotalPages - 1"
                        class="size-9 rounded-xl border border-ink-200 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center">
                    <i class="pi pi-chevron-right text-xs"></i>
                </button>
            </div>
        </template>

        <template #footer>
            <div class="flex w-full items-center justify-between gap-2">
                <span class="text-sm text-ink-500">
                    Выбрано: <b class="text-ink-900">{{ pickedCount }}</b>
                </span>
                <div class="flex gap-2">
                    <Button label="Отмена" severity="secondary" outlined @click="pickerDialog = false" />
                    <Button :label="`Добавить (${pickedCount})`" :disabled="!pickedCount"
                            severity="primary" @click="applyPicked" />
                </div>
            </div>
        </template>
    </Dialog>

</template>
