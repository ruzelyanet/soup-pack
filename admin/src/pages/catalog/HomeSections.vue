<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppTopbar from '@/components/AppTopbar.vue'
import ProductPickerField from '@/components/ProductPickerField.vue'
import { HomeSections, Categories, Products,
         type HomeSection, type Category, type Product } from '@/services/resources'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import { useToast } from 'primevue/usetoast'

const list = ref<HomeSection[]>([])
const cats = ref<Category[]>([])
const prods = ref<Product[]>([])
const loading = ref(true)
const err = ref<string | null>(null)
const dialog = ref(false)
const toast = useToast()

/** Доступные иконки — ровно те, что знает client/src/components/Icon.vue. */
const ICONS = [
    'catalog', 'bag', 'sparkles', 'heart', 'snow', 'leaf',
    'clock', 'home', 'map', 'phone', 'receipt', 'filter',
]

type EditModel = {
    documentId: string
    title: string
    icon: string | null
    sort: number
    visible: boolean
    isHits: boolean
    isSets: boolean
    categoryId: number | null
    productIds: number[]
}
const empty: EditModel = {
    documentId: '', title: '', icon: null, sort: 0,
    visible: true, isHits: false, isSets: false, categoryId: null, productIds: [],
}
const edit = ref<EditModel>({ ...empty })

async function reload() {
    loading.value = true
    err.value = null
    try {
        const [sections, categories, products] = await Promise.all([
            HomeSections.list({ sort: 'sort:asc', populate: ['category', 'products'] }),
            Categories.list({ sort: 'sort:asc' }),
            Products.list({ sort: 'id:asc', 'pagination[pageSize]': 200 }),
        ])
        list.value = sections
        cats.value = categories
        prods.value = products
    } catch (e: any) {
        err.value = e?.response?.status
            ? `${e.response.status} ${e.response.statusText}: ${e?.response?.data?.error?.message || ''}`
            : 'Нет связи с API — запустите backend (cd backend && npm run develop)'
    } finally {
        loading.value = false
    }
}
onMounted(reload)

function openNew() {
    edit.value = { ...empty, sort: list.value.length + 1 }
    dialog.value = true
}
function openEdit(row: HomeSection) {
    edit.value = {
        documentId: row.documentId,
        title: row.title,
        icon: row.icon ?? null,
        sort: row.sort ?? 0,
        visible: row.visible,
        isHits: row.isHits,
        isSets: row.isSets,
        categoryId: row.category?.id ?? null,
        productIds: (row.products || []).map(p => p.id),
    }
    dialog.value = true
}

/** Для режимов «Хиты»/«Наборы» прячем выбор категории/продуктов. */
watch(() => edit.value.isHits, (v) => {
    if (v) { edit.value.isSets = false; edit.value.categoryId = null; edit.value.productIds = [] }
})
watch(() => edit.value.isSets, (v) => {
    if (v) { edit.value.isHits = false; edit.value.categoryId = null; edit.value.productIds = [] }
})

async function save() {
    const data: any = {
        title: edit.value.title.trim(),
        icon: edit.value.icon || null,
        sort: edit.value.sort,
        visible: edit.value.visible,
        isHits: edit.value.isHits,
        isSets: edit.value.isSets,
        category: edit.value.categoryId,
        products: edit.value.productIds,
    }
    if (!data.title) {
        toast.add({ severity: 'warn', summary: 'Введите название', life: 2000 })
        return
    }
    try {
        if (edit.value.documentId) await HomeSections.update(edit.value.documentId, data)
        else                        await HomeSections.create(data)
        dialog.value = false
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1800 })
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка',
                    detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}

async function remove(row: HomeSection) {
    if (!confirm(`Удалить секцию «${row.title}»?`)) return
    try {
        await HomeSections.remove(row.documentId)
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

const categoryOptions = computed(() => cats.value.map(c => ({ id: c.id, name: c.name })))
const iconOptions = ICONS.map(i => ({ value: i, label: i }))
</script>

<template>
    <AppTopbar title="Секции главной">
        <template #actions>
            <Button icon="pi pi-plus" label="Секция" severity="primary" rounded @click="openNew" />
        </template>
    </AppTopbar>
    <div class="p-8">
        <div v-if="err" class="mb-4 bg-tomato-500/10 text-tomato-600 rounded-xl p-4 text-sm">
            {{ err }}
        </div>

        <div class="bg-white rounded-2xl overflow-hidden">
            <DataTable :value="list" :loading="loading" data-key="id"
                       @row-click="(e) => openEdit(e.data)"
                       :pt="{ bodyRow: { class: 'cursor-pointer' } }">
                <Column field="sort" header="#" style="width: 60px" />
                <Column header="Название">
                    <template #body="{ data }">
                        <div class="flex items-center gap-2">
                            <span v-if="data.icon" class="size-7 rounded-md bg-ink-100 text-ink-600 flex items-center justify-center text-[11px] font-bold">
                                {{ data.icon.slice(0, 3) }}
                            </span>
                            <span class="font-semibold">{{ data.title }}</span>
                            <span v-if="data.isHits" class="bg-saffron-300 text-ink-900 rounded-full px-2 py-0.5 text-[10px] font-bold">ХИТЫ</span>
                            <span v-if="data.isSets" class="bg-olive-300 text-ink-900 rounded-full px-2 py-0.5 text-[10px] font-bold">НАБОРЫ</span>
                        </div>
                    </template>
                </Column>
                <Column header="Категория">
                    <template #body="{ data }">
                        <span class="text-ink-500 text-sm">{{ data.category?.name || '—' }}</span>
                    </template>
                </Column>
                <Column header="Товары" style="width: 110px">
                    <template #body="{ data }">
                        <span class="text-ink-500 text-sm">{{ data.isHits ? 'по тегу' : (data.products?.length || 0) + ' шт' }}</span>
                    </template>
                </Column>
                <Column header="Виден" style="width: 90px">
                    <template #body="{ data }">
                        <span :class="data.visible ? 'text-olive-600' : 'text-ink-300'"
                              class="pi"
                              :title="data.visible ? 'Показывается' : 'Скрыт'">
                            {{ data.visible ? '●' : '○' }}
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

    <Dialog v-model:visible="dialog" modal dismissableMask
            :header="edit.documentId ? 'Редактировать секцию' : 'Новая секция'"
            :style="{ width: '640px', maxWidth: '95vw' }">
        <div class="space-y-4">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                <InputText v-model="edit.title" class="mt-1 w-full" />
            </div>

            <div class="grid grid-cols-3 gap-3">
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Иконка</label>
                    <Select v-model="edit.icon" :options="iconOptions" option-label="label" option-value="value"
                            placeholder="Без иконки" show-clear class="mt-1 w-full" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Порядок</label>
                    <InputNumber v-model="edit.sort" class="mt-1 w-full" :min="0" showButtons />
                </div>
                <div class="flex flex-col gap-2 pt-5">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <Checkbox v-model="edit.visible" binary />
                        <span class="text-sm">Показывать</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <Checkbox v-model="edit.isHits" binary />
                        <span class="text-sm">Это «Хиты»</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <Checkbox v-model="edit.isSets" binary />
                        <span class="text-sm">Это «Наборы»</span>
                    </label>
                </div>
            </div>

            <div v-if="!edit.isHits && !edit.isSets">
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Категория (куда ведёт пункт меню)</label>
                <Select v-model="edit.categoryId" :options="categoryOptions"
                        option-label="name" option-value="id"
                        placeholder="Не привязана" show-clear class="mt-1 w-full" />
            </div>

            <div v-if="!edit.isHits && !edit.isSets">
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-1 block">Товары в блоке</label>
                <ProductPickerField v-model="edit.productIds" :products="prods"
                                    placeholder="Выбрать товары" dialog-title="Добавить товары в блок" />
            </div>

            <div v-else-if="edit.isHits" class="bg-saffron-50 border border-saffron-200 rounded-xl p-3 text-sm text-ink-600">
                В режиме «Хиты» состав блока берётся из товаров с тегом <code class="bg-white px-1 rounded">хит</code> — выбирать вручную не нужно.
            </div>

            <div v-else-if="edit.isSets" class="bg-olive-50 border border-olive-200 rounded-xl p-3 text-sm text-ink-600">
                В режиме «Наборы» блок показывает наборы из конструктора с флагом «Показывать в каталоге». Клик по пункту меню ведёт на страницу <code class="bg-white px-1 rounded">/sets</code>.
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="dialog = false" />
            <Button label="Сохранить" severity="primary" @click="save" />
        </template>
    </Dialog>
</template>
