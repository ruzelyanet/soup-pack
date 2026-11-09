<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'
import AppTopbar from '@/components/AppTopbar.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import { Banners, type Banner } from '@/services/resources'
import { mediaUrl, uploadMedia } from '@/services/api'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'

const list = ref<Banner[]>([])
const loading = ref(true)
const dialog = ref(false)
const toast = useToast()

type EditState = {
    documentId: string
    title: string
    subtitle: string
    imageUrl: string
    linkUrl: string
    sort: number
    active: boolean
}
const edit = ref<EditState>({ documentId: '', title: '', subtitle: '', imageUrl: '', linkUrl: '', sort: 10, active: true })

/** Файл-пикер: выбранный, но ещё не загруженный на сервер. */
const pendingFile = ref<File | null>(null)
/** Пользователь нажал «Удалить» для существующей картинки. */
const imageCleared = ref(false)

function onFile(f: File | null) {
    pendingFile.value = f
    imageCleared.value = f === null
}

const page = ref(0)
const pageSize = ref(PAGE_SIZE)
const total = ref(0)

async function reload() {
    loading.value = true
    try {
        const res = await Banners.listPaged({
            sort: 'sort:asc', populate: ['image'],
            'pagination[page]': page.value + 1,
            'pagination[pageSize]': pageSize.value,
        })
        list.value = res.data
        total.value = res.meta.pagination.total
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}
onMounted(reload)
watch([page, pageSize], reload)

function openNew() {
    edit.value = { documentId: '', title: '', subtitle: '', imageUrl: '', linkUrl: '', sort: list.value.length + 1, active: true }
    pendingFile.value = null
    imageCleared.value = false
    dialog.value = true
}

function openEdit(row: Banner) {
    edit.value = {
        documentId: row.documentId,
        title: row.title,
        subtitle: row.subtitle || '',
        imageUrl: mediaUrl(row.image?.url),
        linkUrl: row.linkUrl || '',
        sort: row.sort || 0,
        active: row.active,
    }
    pendingFile.value = null
    imageCleared.value = false
    dialog.value = true
}

async function save() {
    const payload: Record<string, any> = {
        title: edit.value.title,
        subtitle: edit.value.subtitle,
        linkUrl: edit.value.linkUrl,
        sort: edit.value.sort,
        active: edit.value.active,
    }
    try {
        // Загрузка картинки
        if (pendingFile.value) {
            const media = await uploadMedia(pendingFile.value)
            payload.image = media.id
        } else if (imageCleared.value) {
            payload.image = null
        }

        if (edit.value.documentId) {
            await Banners.update(edit.value.documentId, payload)
        } else {
            await Banners.create(payload)
        }
        dialog.value = false
        toast.add({ severity: 'success', summary: 'Сохранено', life: 2000 })
        pendingFile.value = null
        imageCleared.value = false
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}

async function remove(row: Banner) {
    if (!confirm(`Удалить баннер «${row.title}»?`)) return
    try {
        await Banners.remove(row.documentId)
        toast.add({ severity: 'success', summary: 'Удалено', life: 1800 })
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}
</script>

<template>
    <AppTopbar title="Баннеры" subtitle="Карусель на главной каталога">
        <template #actions>
            <Button icon="pi pi-plus" label="Добавить" severity="primary" rounded @click="openNew" />
        </template>
    </AppTopbar>

    <div class="p-8">
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
                <Column field="sort" header="#" style="width: 60px" />
                <Column header="Превью" style="width: 120px">
                    <template #body="{ data }">
                        <div class="h-12 w-20 rounded-lg overflow-hidden bg-gradient-to-br from-tomato-500 to-ink-900">
                            <img v-if="data.image?.url" :src="mediaUrl(data.image.url)" alt="" class="w-full h-full object-cover" />
                        </div>
                    </template>
                </Column>
                <Column field="title" header="Заголовок" />
                <Column field="subtitle" header="Подзаголовок" />
                <Column field="linkUrl" header="Ссылка" />
                <Column header="Статус" style="width: 120px">
                    <template #body="{ data }">
                        <span class="rounded-full px-3 py-1 text-xs font-semibold"
                              :class="data.active ? 'bg-olive-500/15 text-olive-500' : 'bg-ink-100 text-ink-400'">
                            {{ data.active ? 'Активен' : 'Выключен' }}
                        </span>
                    </template>
                </Column>
                <Column style="width: 60px">
                    <template #body="{ data }">
                        <Button icon="pi pi-trash" text severity="danger"
                                @click.stop="remove(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <Dialog v-model:visible="dialog" modal dismissableMask
            :header="edit.documentId ? 'Редактировать баннер' : 'Новый баннер'"
            :style="{ width: '560px' }">
        <div class="space-y-4">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Заголовок</label>
                <input v-model="edit.title"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Подзаголовок</label>
                <input v-model="edit.subtitle"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
            <ImageUploader v-model="edit.imageUrl" @file="onFile"
                           aspect="video" label="Картинка баннера" />
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Ссылка при клике</label>
                <input v-model="edit.linkUrl"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Сортировка</label>
                    <input v-model.number="edit.sort" type="number"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                </div>
                <div class="flex items-end">
                    <label class="inline-flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" v-model="edit.active" class="size-5" />
                        Активен
                    </label>
                </div>
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="dialog = false" />
            <Button label="Сохранить" severity="primary" @click="save" />
        </template>
    </Dialog>
</template>
