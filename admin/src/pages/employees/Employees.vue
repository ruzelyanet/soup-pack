<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { Employees, type Employee } from '@/services/resources'
import DataTable from 'primevue/datatable'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'
import Column from 'primevue/column'
import Button from 'primevue/button'

const router = useRouter()
const list = ref<Employee[]>([])
const loading = ref(true)
const err = ref<string | null>(null)

const page = ref(0)
const pageSize = ref(PAGE_SIZE)
const total = ref(0)

async function reload() {
    loading.value = true
    err.value = null
    try {
        const res = await Employees.listPaged({
            sort: 'id:asc',
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

const roleLabel: Record<string, string> = {
    manager: 'Главный сотрудник',
    duty: 'Дежурный сотрудник',
    courier: 'Обычный сотрудник',
}
</script>

<template>
    <AppTopbar title="Сотрудники" subtitle="Доступ по персональному ключу">
        <template #actions>
            <Button icon="pi pi-plus" label="Сотрудник" severity="primary" rounded
                    @click="router.push('/employees/new')" />
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
                       @row-click="(e) => router.push(`/employees/${e.data.documentId}`)"
                       :pt="{ bodyRow: { class: 'cursor-pointer' } }">
                <Column header="Сотрудник">
                    <template #body="{ data }">
                        <div class="flex items-center gap-3">
                            <div class="size-9 rounded-full bg-ink-900 text-cream-50 flex items-center justify-center text-xs font-bold">
                                {{ (data.fullName || '').split(' ').map((p: string) => p[0]).slice(0,2).join('') }}
                            </div>
                            <div>
                                <div class="font-semibold">{{ data.fullName }}</div>
                                <div class="text-xs text-ink-400">{{ data.phone }}</div>
                            </div>
                        </div>
                    </template>
                </Column>
                <Column header="Роль">
                    <template #body="{ data }">
                        <span class="rounded-full px-3 py-1 text-xs font-semibold"
                              :class="data.role === 'manager' ? 'bg-tomato-500/15 text-tomato-500'
                                   : data.role === 'duty' ? 'bg-saffron-300/20 text-saffron-500'
                                   : 'bg-ink-100 text-ink-500'">
                            {{ roleLabel[data.role] }}
                        </span>
                    </template>
                </Column>
                <Column header="Персональный ключ" style="width: 220px">
                    <template #body="{ data }">
                        <code class="text-xs bg-ink-50 rounded px-2 py-1">{{ data.personalKey }}</code>
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>
</template>
