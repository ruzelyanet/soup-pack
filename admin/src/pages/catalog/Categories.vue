<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { Categories, type Category } from '@/services/resources'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'

const list = ref<Category[]>([])
const loading = ref(true)
const err = ref<string | null>(null)
const dialog = ref(false)
const edit = ref<{ documentId: string; name: string; slug: string; sort: number }>({ documentId: '', name: '', slug: '', sort: 0 })
const toast = useToast()

const page = ref(0)
const pageSize = ref(PAGE_SIZE)
const total = ref(0)

async function reload() {
    loading.value = true
    err.value = null
    try {
        const res = await Categories.listPaged({
            sort: 'sort:asc',
            'pagination[page]': page.value + 1,
            'pagination[pageSize]': pageSize.value,
        })
        list.value = res.data
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
watch([page, pageSize], reload)

function openNew() {
    edit.value = { documentId: '', name: '', slug: '', sort: list.value.length + 1 }
    dialog.value = true
}

async function save() {
    try {
        if (edit.value.documentId) {
            await Categories.update(edit.value.documentId, {
                name: edit.value.name, slug: edit.value.slug, sort: edit.value.sort,
            })
        } else {
            await Categories.create({
                name: edit.value.name, slug: edit.value.slug, sort: edit.value.sort,
            })
        }
        dialog.value = false
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1800 })
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}

async function remove(row: Category) {
    if (!confirm(`Удалить категорию «${row.name}»?`)) return
    await Categories.remove(row.documentId)
    await reload()
}
</script>

<template>
    <AppTopbar title="Категории товаров">
        <template #actions>
            <Button icon="pi pi-plus" label="Категория" severity="primary" rounded @click="openNew" />
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
                       @row-click="(e) => { edit = { documentId: e.data.documentId, name: e.data.name, slug: e.data.slug || '', sort: e.data.sort || 0 }; dialog = true }"
                       :pt="{ bodyRow: { class: 'cursor-pointer' } }">
                <Column field="id" header="ID" style="width: 80px" />
                <Column field="name" header="Название" />
                <Column field="slug" header="Slug" />
                <Column field="sort" header="Сорт." style="width: 100px" />
                <Column style="width: 60px">
                    <template #body="{ data }">
                        <Button icon="pi pi-trash" text severity="danger" @click.stop="remove(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <Dialog v-model:visible="dialog" modal dismissableMask :header="edit.documentId ? 'Редактировать категорию' : 'Новая категория'"
            :style="{ width: '480px' }">
        <div class="space-y-4">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                <input v-model="edit.name"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Slug</label>
                <input v-model="edit.slug"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Сортировка</label>
                <input v-model.number="edit.sort" type="number"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="dialog = false" />
            <Button label="Сохранить" severity="primary" @click="save" />
        </template>
    </Dialog>
</template>
