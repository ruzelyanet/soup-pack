<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import PhoneInput from '@/components/PhoneInput.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import { Employees, type Employee } from '@/services/resources'
import { mediaUrl, uploadMedia } from '@/services/api'
import DataTable from 'primevue/datatable'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE as PAGE_SIZE } from '@/utils/paginator'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'

const router = useRouter()
const toast = useToast()
const list = ref<Employee[]>([])
const loading = ref(true)
const err = ref<string | null>(null)

const page = ref(0)
const pageSize = ref(PAGE_SIZE)
const total = ref(0)
const q = ref('')
const qDebounced = ref('')
let qTimer: ReturnType<typeof setTimeout> | null = null
watch(q, (v) => {
    if (qTimer) clearTimeout(qTimer)
    qTimer = setTimeout(() => { qDebounced.value = v.trim() }, 250)
})

async function reload() {
    loading.value = true
    err.value = null
    try {
        const query: Record<string, any> = {
            sort: 'id:asc',
            populate: ['photo'],
            'pagination[page]': page.value + 1,
            'pagination[pageSize]': pageSize.value,
        }
        const term = qDebounced.value.trim()
        if (term) {
            query['filters[$or][0][fullName][$containsi]'] = term
            query['filters[$or][1][phone][$containsi]'] = term
        }
        const res = await Employees.listPaged(query)
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
watch(qDebounced, () => { page.value = 0; reload() })

const roleLabel: Record<string, string> = {
    manager: 'Главный',
    duty: 'Оператор',
    courier: 'Курьер',
}

// --- Create dialog ---
const dialog = ref(false)
const createStep = ref<'edit' | 'created'>('edit')
const createdDocId = ref('')
const createdKey = ref('')
const submitting = ref(false)

const form = reactive({
    fullName: '',
    phone: '+998 ',
    role: 'courier' as 'manager' | 'duty' | 'courier',
    photoUrl: '',
})
const pendingPhoto = ref<File | null>(null)

function openCreate() {
    form.fullName = ''
    form.phone = '+998 '
    form.role = 'courier'
    form.photoUrl = ''
    pendingPhoto.value = null
    createStep.value = 'edit'
    createdDocId.value = ''
    createdKey.value = ''
    dialog.value = true
}

function genKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let out = ''
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
    return 'KEY-' + out
}

async function createEmployee() {
    if (!form.fullName.trim() || form.phone.replace(/\D/g, '').length < 12) {
        toast.add({ severity: 'warn', summary: 'Заполните ФИО и телефон', life: 2000 })
        return
    }
    submitting.value = true
    try {
        const plain = genKey()
        const payload: Record<string, any> = {
            fullName: form.fullName.trim(),
            phone: form.phone,
            role: form.role,
            personalKey: plain,
            active: true,
        }
        if (pendingPhoto.value) {
            const media = await uploadMedia(pendingPhoto.value)
            payload.photo = media.id
        }
        const created = await Employees.create(payload as any)
        createdDocId.value = created.documentId
        createdKey.value = plain
        createStep.value = 'created'
        await reload()
    } catch (e: any) {
        toast.add({
            severity: 'error',
            summary: 'Не удалось создать',
            detail: e?.response?.data?.error?.message || e?.message,
            life: 3500,
        })
    } finally {
        submitting.value = false
    }
}

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.add({ severity: 'info', summary: 'Скопировано', life: 1200 })
    } catch { /* ignore */ }
}

function goToCard() {
    dialog.value = false
    router.push(`/employees/${createdDocId.value}`)
}
</script>

<template>
    <AppTopbar title="Сотрудники" subtitle="Доступ по персональному ключу">
        <template #actions>
            <Button icon="pi pi-plus" label="Сотрудник" severity="primary" rounded @click="openCreate" />
        </template>
    </AppTopbar>

    <div class="p-8">
        <div v-if="err" class="mb-4 bg-tomato-500/10 text-tomato-600 rounded-xl p-4 text-sm">
            {{ err }}
        </div>
        <div class="mb-4">
            <input v-model="q" type="search" placeholder="Поиск по имени или телефону"
                   class="w-full max-w-sm rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
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
                        <div class="flex items-center gap-3" :class="{ 'opacity-50': data.active === false }">
                            <img v-if="data.photo?.url" :src="mediaUrl(data.photo.url)" alt=""
                                 class="size-9 rounded-full object-cover" />
                            <div v-else class="size-9 rounded-full bg-ink-900 text-cream-50 flex items-center justify-center text-xs font-bold">
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
                <Column header="Статус" style="width: 160px">
                    <template #body="{ data }">
                        <span class="rounded-full px-3 py-1 text-xs font-semibold"
                              :class="data.active === false ? 'bg-tomato-500/15 text-tomato-500' : 'bg-emerald-500/15 text-emerald-600'">
                            {{ data.active === false ? 'Отключён' : 'Активен' }}
                        </span>
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <!-- Create dialog -->
    <Dialog v-model:visible="dialog" modal dismissableMask
            :header="createStep === 'edit' ? 'Новый сотрудник' : 'Сотрудник создан'"
            :style="{ width: '520px' }" :pt="{ root: { class: 'rounded-2xl' } }">
        <div v-if="createStep === 'edit'" class="space-y-4">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Фото</label>
                <div class="mt-1 max-w-[160px]">
                    <ImageUploader v-model="form.photoUrl" aspect="square"
                                   @file="(f: File | null) => { pendingPhoto = f }" />
                </div>
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">ФИО</label>
                <input v-model="form.fullName" autofocus
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Телефон</label>
                <PhoneInput v-model="form.phone"
                            input-class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Роль</label>
                <div class="mt-2 grid grid-cols-3 gap-2">
                    <button v-for="r in (['manager', 'duty', 'courier'] as const)" :key="r"
                            type="button"
                            class="rounded-xl py-3 text-sm font-semibold border transition"
                            :class="form.role === r ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                            @click="form.role = r">
                        {{ roleLabel[r] }}
                    </button>
                </div>
            </div>
        </div>

        <div v-else class="space-y-4">
            <div class="text-sm text-ink-600">
                Сотрудник <b>{{ form.fullName }}</b> создан. Передайте персональный ключ — он понадобится для входа:
            </div>
            <div class="bg-ink-900 text-cream-50 rounded-xl p-4 font-mono text-sm break-all flex items-center justify-between gap-3">
                <span class="flex-1 min-w-0">{{ createdKey }}</span>
                <button type="button" class="shrink-0 text-cream-50/80 hover:text-cream-50"
                        @click="copy(createdKey)">
                    <i class="pi pi-copy" />
                </button>
            </div>
            <div class="text-xs text-saffron-500 font-semibold">
                Ключ показывается один раз. После закрытия окна восстановить его нельзя — только перевыпустить.
            </div>
        </div>

        <template #footer>
            <template v-if="createStep === 'edit'">
                <Button label="Отмена" severity="secondary" text @click="dialog = false" />
                <Button label="Создать" icon="pi pi-check" severity="primary"
                        :disabled="submitting" @click="createEmployee" />
            </template>
            <Button v-else label="К карточке" icon="pi pi-arrow-right" severity="primary" @click="goToCard" />
        </template>
    </Dialog>
</template>
