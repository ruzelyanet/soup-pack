<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { Products, type Product } from '@/services/resources'
import { mediaUrl } from '@/services/api'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import FloatLabel from 'primevue/floatlabel'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'

const router = useRouter()
const search = ref('')
const list = ref<Product[]>([])
const loading = ref(true)
const err = ref<string | null>(null)

const page = ref(0)
const pageSize = ref(PAGE_SIZE)
const total = ref(0)

async function reload() {
    loading.value = true
    err.value = null
    try {
        const s = search.value.trim()
        const filters = s ? { name: { $containsi: s } } : undefined
        const res = await Products.listPaged({
            populate: ['category', 'image'],
            sort: 'name:asc',
            filters,
            'pagination[page]': page.value + 1,
            'pagination[pageSize]': pageSize.value,
        })
        list.value = res.data.map((p) => ({ ...p, categoryName: p.category?.name || '—' })) as any
        total.value = res.meta.pagination.total
    } catch (e: any) {
        err.value = e?.response?.status
            ? `${e.response.status} ${e.response.statusText}: ${e?.response?.data?.error?.message || ''}`
            : 'Нет связи с API — запустите backend (cd backend && npm run develop)'
    } finally {
        loading.value = false
    }
}

onMounted(reload)

let searchDebounce: number | null = null
watch(search, () => {
    if (searchDebounce != null) clearTimeout(searchDebounce)
    searchDebounce = window.setTimeout(() => { page.value = 0; reload() }, 400)
})
watch([page, pageSize], reload)

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
</script>

<template>
    <AppTopbar title="Продукты" subtitle="Карточки для каталога">
        <template #actions>
            <Button icon="pi pi-plus" label="Продукт" severity="primary" rounded
                    @click="router.push('/catalog/products/new')" />
        </template>
    </AppTopbar>

    <div class="p-8 space-y-4">
        <div v-if="err" class="bg-tomato-500/10 text-tomato-600 rounded-xl p-4 text-sm">
            {{ err }}
        </div>
        <div class="bg-white rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div class="flex-1 min-w-[260px]">
                <FloatLabel variant="on">
                    <IconField>
                        <InputIcon class="pi pi-search" />
                        <InputText id="products-search" v-model.trim="search"
                                   class="w-full pl-10" :class="search ? 'pr-10' : ''" />
                        <InputIcon v-if="search" class="pi pi-times cursor-pointer"
                                   @click="search = ''" />
                    </IconField>
                    <label for="products-search">Поиск по названию</label>
                </FloatLabel>
            </div>
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
                       @row-click="(e) => router.push(`/catalog/products/${e.data.id}`)"
                       :pt="{ bodyRow: { class: 'cursor-pointer' } }">
                <Column header="" style="width: 60px">
                    <template #body="{ data }">
                        <div class="size-10 rounded-lg bg-tomato-500 text-cream-50 flex items-center justify-center text-xs font-bold overflow-hidden">
                            <img v-if="data.image?.url" :src="mediaUrl(data.image.url)" alt="" class="w-full h-full object-cover" />
                            <span v-else>SP</span>
                        </div>
                    </template>
                </Column>
                <Column field="name" header="Название" />
                <Column field="categoryName" header="Категория" />
                <Column field="weight" header="Вес, г" style="width: 100px" />
                <Column header="Цена" style="width: 160px">
                    <template #body="{ data }">
                        <div class="font-semibold">{{ fmt(Number(data.price)) }}</div>
                        <div v-if="data.oldPrice" class="text-xs line-through text-ink-400">
                            {{ fmt(Number(data.oldPrice)) }}
                        </div>
                    </template>
                </Column>
                <Column header="Статус" style="width: 120px">
                    <template #body="{ data }">
                        <span class="rounded-full px-3 py-1 text-xs font-semibold"
                              :class="data.available ? 'bg-olive-500/15 text-olive-500' : 'bg-ink-100 text-ink-400'">
                            {{ data.available ? 'В продаже' : 'Скрыт' }}
                        </span>
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>
</template>
