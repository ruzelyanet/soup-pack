<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import PhoneInput from '@/components/PhoneInput.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import { Employees, Orders, regenerateEmployeeKey, getEmployeeStats, type EmployeeStats, type Order } from '@/services/resources'
import { uploadMedia, mediaUrl } from '@/services/api'
import { useAuth } from '@/stores/auth'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { PAGINATOR_TEMPLATE, PAGINATOR_REPORT, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/utils/paginator'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const auth = useAuth()

const isSelf = computed(() => !!auth.employee && emp.id === auth.employee.id)

type Role = 'manager' | 'duty' | 'courier'

const loading = ref(true)
const saving = ref(false)

// --- Orders: server-paginated.
const myOrders = ref<Order[]>([])
const ordersPage = ref(0)
const ordersPageSize = ref(DEFAULT_PAGE_SIZE)
const ordersTotal = ref(0)
const ordersLoading = ref(false)

// --- Статистика по сотруднику.
const stats = ref<EmployeeStats | null>(null)

const emp = reactive({
    documentId: '',
    id: 0,
    fullName: '',
    phone: '',
    role: 'courier' as Role,
    active: true,
    photoUrl: '',
})

/** Plain-ключ, только что выданный сервером (показывается до перезагрузки страницы). */
const plainKey = ref<string | null>(null)

/** Редактирование профиля (ФИО + телефон). */
const editingProfile = ref(false)
const draft = reactive({ fullName: '', phone: '' })

const roleLabel: Record<Role, string> = {
    manager: 'Главный',
    duty: 'Оператор',
    courier: 'Курьер',
}
const roleChip: Record<Role, string> = {
    manager: 'bg-tomato-500/15 text-tomato-500',
    duty: 'bg-saffron-300/20 text-saffron-500',
    courier: 'bg-ink-100 text-ink-500',
}

const initials = computed(() =>
    (emp.fullName || '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '—',
)

async function loadOrdersPage() {
    ordersLoading.value = true
    try {
        const res = await Orders.listPaged({
            populate: ['client'],
            'filters[employee][documentId][$eq]': route.params.id,
            sort: 'createdAt:desc',
            'pagination[page]': ordersPage.value + 1,
            'pagination[pageSize]': ordersPageSize.value,
        })
        myOrders.value = res.data
        ordersTotal.value = res.meta.pagination.total
    } catch {
        /* тост на уровне первой загрузки */
    } finally {
        ordersLoading.value = false
    }
}

async function loadAll() {
    loading.value = true
    try {
        const docId = route.params.id as string
        const [e] = await Promise.all([
            Employees.get(docId, { populate: ['photo'] }),
            loadOrdersPage(),
            getEmployeeStats(docId).then((s) => { stats.value = s }).catch(() => { /* stats не критичны */ }),
        ])
        Object.assign(emp, {
            documentId: e.documentId,
            id: e.id,
            fullName: e.fullName,
            phone: e.phone,
            role: e.role,
            active: e.active !== false,
            photoUrl: mediaUrl(e.photo?.url),
        })
    } catch (err: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: err?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}
onMounted(loadAll)

/** Единая обёртка для PUT с частичными данными — каждое действие независимое. */
async function patch(data: Record<string, any>, ok: string) {
    saving.value = true
    try {
        await Employees.update(emp.documentId, data as any)
        toast.add({ severity: 'success', summary: ok, life: 1500 })
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: err?.response?.data?.error?.message || err?.message,
            life: 3500,
        })
        throw err
    } finally {
        saving.value = false
    }
}

function startEditProfile() {
    draft.fullName = emp.fullName
    draft.phone = emp.phone
    editingProfile.value = true
}
function cancelEditProfile() {
    editingProfile.value = false
}
async function saveProfile() {
    await patch({ fullName: draft.fullName, phone: draft.phone }, 'Профиль обновлён')
    emp.fullName = draft.fullName
    emp.phone = draft.phone
    editingProfile.value = false
}

async function setRole(role: Role) {
    if (emp.role === role) return
    await patch({ role }, 'Роль изменена')
    emp.role = role
}

async function setActive(active: boolean) {
    await patch({ active }, active ? 'Включён' : 'Отключён')
    emp.active = active
}

/** Загрузка новой аватарки — сразу uploadMedia + PATCH. */
const pendingPhoto = ref<File | null>(null)
function onPhotoFile(f: File | null) {
    pendingPhoto.value = f
    if (f) savePhoto()
    else if (emp.photoUrl) clearPhoto()
}
async function savePhoto() {
    if (!pendingPhoto.value) return
    saving.value = true
    try {
        const media = await uploadMedia(pendingPhoto.value)
        await Employees.update(emp.documentId, { photo: media.id } as any)
        emp.photoUrl = mediaUrl(media.url)
        toast.add({ severity: 'success', summary: 'Фото обновлено', life: 1500 })
    } catch (err: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: err?.message, life: 3000 })
    } finally {
        pendingPhoto.value = null
        saving.value = false
    }
}
async function clearPhoto() {
    await patch({ photo: null }, 'Фото убрано')
    emp.photoUrl = ''
}

function regenerateKey() {
    confirm.require({
        header: 'Перевыпустить ключ?',
        message: 'Старый ключ сразу перестанет работать — сотрудник не сможет войти, пока не получит новый.',
        acceptLabel: 'Перевыпустить',
        rejectLabel: 'Отмена',
        acceptProps: { severity: 'danger' },
        accept: async () => {
            try {
                plainKey.value = await regenerateEmployeeKey(emp.documentId)
                toast.add({ severity: 'success', summary: 'Ключ перевыпущен', life: 1500 })
            } catch (err: any) {
                toast.add({ severity: 'error', summary: 'Ошибка', detail: err?.message, life: 3000 })
            }
        },
    })
}

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.add({ severity: 'info', summary: 'Скопировано', life: 1200 })
    } catch {
        /* ignore */
    }
}

function fmtSum(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
</script>

<template>
    <AppTopbar :title="emp.fullName || 'Сотрудник'"
               :subtitle="roleLabel[emp.role]"
               back="/employees">
    </AppTopbar>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else class="p-8 grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
        <!-- LEFT COLUMN -->
        <div class="space-y-6">
            <!-- HERO -->
            <div class="bg-white rounded-3xl p-6 flex items-center gap-6">
                <div class="relative shrink-0 group">
                    <div class="size-32 rounded-full overflow-hidden ring-4 ring-ink-50">
                        <img v-if="emp.photoUrl" :src="emp.photoUrl" alt=""
                             class="w-full h-full object-cover" />
                        <div v-else class="w-full h-full bg-ink-900 text-cream-50 flex items-center justify-center font-display font-bold text-4xl">
                            {{ initials }}
                        </div>
                    </div>
                    <label class="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 cursor-pointer flex items-center justify-center text-cream-50 text-xs font-bold tracking-wider uppercase transition">
                        Изменить
                        <input type="file" accept="image/*" class="hidden"
                               @change="(e: any) => e.target.files?.[0] && onPhotoFile(e.target.files[0])" />
                    </label>
                    <button v-if="emp.photoUrl" type="button"
                            title="Убрать фото" :disabled="saving"
                            class="absolute -top-1 -right-1 size-7 rounded-full bg-white border border-ink-200 text-ink-500 hover:text-tomato-500 hover:border-tomato-500 flex items-center justify-center shadow-sm transition disabled:opacity-60"
                            @click="onPhotoFile(null)">
                        <i class="pi pi-times text-xs" />
                    </button>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-display font-black text-3xl leading-tight break-words">
                        {{ emp.fullName || '—' }}
                    </div>
                    <div class="mt-3 flex items-center flex-wrap gap-2">
                        <span class="rounded-full px-3 py-1 text-xs font-bold" :class="roleChip[emp.role]">
                            {{ roleLabel[emp.role] }}
                        </span>
                        <span class="rounded-full px-3 py-1 text-xs font-bold"
                              :class="emp.active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-tomato-500/15 text-tomato-500'">
                            <i class="pi" :class="emp.active ? 'pi-check-circle' : 'pi-ban'" style="font-size: 0.7rem" />
                            {{ emp.active ? 'Активен' : 'Отключён' }}
                        </span>
                    </div>
                    <button v-if="emp.phone" type="button"
                            class="mt-3 inline-flex items-center gap-2 text-ink-600 hover:text-ink-900 transition"
                            @click="copy(emp.phone)">
                        <i class="pi pi-phone text-sm" />
                        <span class="font-semibold">{{ emp.phone }}</span>
                        <i class="pi pi-copy text-xs opacity-60" />
                    </button>
                </div>
                <div class="shrink-0 flex flex-col gap-2">
                    <Button v-if="emp.active" label="Отключить" severity="secondary" outlined
                            icon="pi pi-ban" :disabled="saving || isSelf" @click="setActive(false)"
                            :title="isSelf ? 'Нельзя отключить свою учётную запись' : ''" />
                    <Button v-else label="Включить" severity="primary"
                            icon="pi pi-check-circle" :disabled="saving" @click="setActive(true)" />
                </div>
            </div>

            <!-- PROFILE (inline edit) -->
            <div class="bg-white rounded-3xl p-6 space-y-4">
                <div class="flex items-center justify-between">
                    <div class="font-display font-bold text-lg">Профиль</div>
                    <Button v-if="!editingProfile" label="Изменить" icon="pi pi-pencil"
                            severity="secondary" text @click="startEditProfile" />
                    <div v-else class="flex gap-2">
                        <Button label="Отмена" severity="secondary" text @click="cancelEditProfile" />
                        <Button label="Сохранить" icon="pi pi-check" severity="primary"
                                :disabled="saving" @click="saveProfile" />
                    </div>
                </div>
                <div v-if="!editingProfile" class="grid grid-cols-[150px_1fr] gap-y-3 text-sm">
                    <div class="text-ink-400 font-semibold uppercase text-xs tracking-wider">ФИО</div>
                    <div class="font-semibold">{{ emp.fullName || '—' }}</div>
                    <div class="text-ink-400 font-semibold uppercase text-xs tracking-wider">Телефон</div>
                    <div class="font-semibold">{{ emp.phone || '—' }}</div>
                </div>
                <div v-else class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-ink-400">ФИО</label>
                        <input v-model="draft.fullName"
                               class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    </div>
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Телефон</label>
                        <PhoneInput v-model="draft.phone"
                                    input-class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    </div>
                </div>
            </div>

            <!-- ROLE (instant save) -->
            <div class="bg-white rounded-3xl p-6 space-y-4">
                <div class="flex items-center justify-between gap-2">
                    <div class="font-display font-bold text-lg">Роль</div>
                    <span v-if="isSelf" class="text-xs text-ink-400 inline-flex items-center gap-1">
                        <i class="pi pi-lock text-xs" />
                        Своя роль не меняется
                    </span>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <button v-for="r in (['manager', 'duty', 'courier'] as Role[])" :key="r"
                            type="button"
                            :disabled="saving || isSelf"
                            class="rounded-xl py-3 text-sm font-semibold border transition disabled:opacity-60 disabled:cursor-not-allowed"
                            :class="emp.role === r ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                            @click="setRole(r)">
                        {{ roleLabel[r] }}
                    </button>
                </div>
                <div class="text-xs text-ink-400">
                    <span v-if="emp.role === 'manager'">Полный доступ: сотрудники, каталог, настройки.</span>
                    <span v-else-if="emp.role === 'duty'">Приём заявок, заказы, касса.</span>
                    <span v-else>Только свои заказы.</span>
                </div>
            </div>

            <!-- ORDERS (paginated) -->
            <div class="bg-white rounded-3xl p-6 space-y-3">
                <div class="flex items-center justify-between gap-2">
                    <div class="font-display font-bold text-lg">История заказов</div>
                    <RouterLink v-if="ordersTotal > 0"
                                :to="`/orders?employee=${emp.documentId}`"
                                class="text-sm font-semibold text-ink-600 hover:text-ink-900 no-underline inline-flex items-center gap-1">
                        Все заказы
                        <i class="pi pi-arrow-right text-xs" />
                    </RouterLink>
                </div>
                <div v-if="!ordersTotal && !ordersLoading" class="text-sm text-ink-400 py-6 text-center">
                    Пока не обработано ни одного заказа.
                </div>
                <DataTable v-else :value="myOrders" :loading="ordersLoading" data-key="id"
                           lazy paginator
                           :rows="ordersPageSize" :first="ordersPage * ordersPageSize"
                           :total-records="ordersTotal"
                           :rows-per-page-options="PAGE_SIZE_OPTIONS"
                           :paginator-template="PAGINATOR_TEMPLATE"
                           :current-page-report-template="PAGINATOR_REPORT"
                           @page="(ev: any) => { ordersPage = ev.page; ordersPageSize = ev.rows; loadOrdersPage() }"
                           @row-click="(e: any) => router.push(`/orders?open=${e.data.id}`)"
                           :pt="{ bodyRow: { class: 'cursor-pointer' } }">
                    <Column header="Заказ">
                        <template #body="{ data }">
                            <div class="font-semibold text-sm">{{ data.code }}</div>
                            <div class="text-xs text-ink-400">{{ data.client?.fullName || '—' }}</div>
                        </template>
                    </Column>
                    <Column header="Дата" style="width: 180px">
                        <template #body="{ data }">
                            <span class="text-sm text-ink-600">
                                {{ new Date(data.createdAt).toLocaleString('ru-RU') }}
                            </span>
                        </template>
                    </Column>
                    <Column header="Сумма" style="width: 140px" class="text-right">
                        <template #body="{ data }">
                            <span class="font-semibold">{{ fmtSum(Number(data.total)) }}</span>
                        </template>
                    </Column>
                </DataTable>
            </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="space-y-6">
            <!-- STATS -->
            <div class="bg-white rounded-3xl p-6 space-y-4">
                <div class="font-display font-bold text-lg">Статистика</div>
                <div v-if="!stats" class="text-sm text-ink-400 py-2">Загрузка…</div>
                <div v-else class="grid grid-cols-2 gap-3">
                    <div class="rounded-2xl bg-ink-50 p-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Всего заказов</div>
                        <div class="mt-1 font-display font-black text-2xl text-ink-900">{{ stats.totalCount }}</div>
                    </div>
                    <div class="rounded-2xl bg-emerald-500/10 p-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-emerald-600">Выполнено</div>
                        <div class="mt-1 font-display font-black text-2xl text-emerald-700">{{ stats.doneCount }}</div>
                    </div>
                    <div class="rounded-2xl bg-ink-50 p-4 col-span-2">
                        <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Выручка</div>
                        <div class="mt-1 font-display font-black text-2xl text-ink-900">{{ fmtSum(stats.revenueAll) }}</div>
                    </div>
                    <div class="rounded-2xl bg-saffron-300/15 p-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-saffron-500">За 30 дней</div>
                        <div class="mt-1 font-display font-bold text-xl text-ink-900">{{ fmtSum(stats.revenue30) }}</div>
                        <div class="text-xs text-ink-400 mt-0.5">{{ stats.count30 }} заказов</div>
                    </div>
                    <div class="rounded-2xl bg-ink-50 p-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-ink-400">Средний чек</div>
                        <div class="mt-1 font-display font-bold text-xl text-ink-900">{{ fmtSum(stats.avgCheck) }}</div>
                    </div>
                </div>
            </div>

            <!-- ACCESS -->
            <div class="bg-white rounded-3xl p-6 space-y-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-shield text-ink-900" />
                    <div class="font-display font-bold text-lg">Доступ в админку</div>
                </div>
                <div class="text-xs text-ink-400">
                    Логин на <code class="bg-ink-50 rounded px-1">/login</code> по номеру телефона и персональному ключу.
                </div>

                <div v-if="plainKey" class="space-y-2">
                    <div class="bg-ink-900 text-cream-50 rounded-xl p-4 font-mono text-sm break-all flex items-center justify-between gap-3">
                        <span class="flex-1 min-w-0">{{ plainKey }}</span>
                        <button type="button" class="shrink-0 text-cream-50/80 hover:text-cream-50"
                                @click="copy(plainKey!)">
                            <i class="pi pi-copy" />
                        </button>
                    </div>
                    <div class="text-xs text-saffron-500 font-semibold">
                        Запишите или отправьте сотруднику — после перезагрузки страницы ключ исчезнет.
                    </div>
                </div>
                <div v-else class="bg-ink-50 rounded-xl p-4 text-sm text-ink-600 flex items-center gap-2">
                    <i class="pi pi-lock" />
                    Ключ зашифрован — исходный увидеть нельзя.
                </div>

                <Button label="Перевыпустить ключ" icon="pi pi-refresh"
                        severity="primary" outlined class="w-full"
                        @click="regenerateKey" />
            </div>
        </div>
    </div>
</template>
