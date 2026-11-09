<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import AppTopbar from '@/components/AppTopbar.vue'
import { Requests } from '@/services/requests'
import { Employees } from '@/services/resources'
import type { Employee, Order, RequestEvent, RequestFull, RequestGoalState, RequestRow } from '@/services/resources'
import { useAuth } from '@/stores/auth'
import { useRequestsFeed } from '@/stores/requestsFeed'
import CreateOrderDialog from '@/pages/orders/components/CreateOrderDialog.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuth()
const feed = useRequestsFeed()

/** Банер «Заявку изменил/принял …», пока сотрудник не нажмёт «Обновить». */
const liveBanner = ref<{ kind: string; actorName: string } | null>(null)
/** Пользователь что-то редактирует → не перезаписывать входящие данные. */
const isEditingLocally = computed(() => editOpen.value || loseOpen.value)

const data = ref<RequestFull | null>(null)
const loading = ref(true)
const employees = ref<Employee[]>([])
const loseOpen = ref(false)
const loseReason = ref('не дозвонились')
const loseNote = ref('')
const editOpen = ref(false)
const editForm = reactive({ name: '', phone: '', comment: '', type: 'individual' as 'individual' | 'shop' })
const createOrderOpen = ref(false)

const request = computed<RequestRow | null>(() => data.value?.request || null)
const events = computed<RequestEvent[]>(() => data.value?.events || [])
const goalStates = computed<RequestGoalState[]>(() => data.value?.goalStates || [])

const liveGoals = computed(() => {
    const colId = request.value?.column?.id
    return goalStates.value.filter((g) => g.column?.id === colId && !g.removed)
})
const removedGoals = computed(() => goalStates.value.filter((g) => g.removed))

const canMutate = computed(() => {
    const r = request.value
    if (!r || !auth.role) return false
    if (r.lockedAt) return false
    if (auth.role === 'manager') return true
    if (auth.role === 'duty') return r.assignee?.id === auth.employee?.id
    return false
})
const canReassign = computed(() => auth.role === 'manager' && !request.value?.lockedAt)
const typeLabel = computed(() => (request.value?.type === 'shop' ? 'Магазин' : 'Физлицо'))

const linkedOrder = computed(() => {
    const r = request.value as (RequestRow & { order?: { id: number; documentId: string; code: string } | null }) | null
    return r?.order || null
})

const canConvert = computed(() => {
    const r = request.value
    if (!r) return false
    if (r.outcome !== 'open') return false
    if (r.lockedAt) return false
    if (linkedOrder.value) return false
    if (!canMutate.value) return false
    return r.column?.kind === 'done'
})

const orderPrefill = computed(() => {
    const r = request.value
    if (!r) return null
    const addressValue = (r.values || []).find((v) => v.key === 'address' || v.key === 'district')
    return {
        requestId: r.id,
        client: {
            fullName: r.name,
            phone: r.phone,
            address: addressValue ? String(addressValue.value || '') : '',
            lat: null,
            lng: null,
        },
        comment: r.comment || undefined,
    }
})

function onOrderCreated(o: Order) {
    createOrderOpen.value = false
    // После создания заказа из заявки — сразу на страницу заказа.
    if (o?.id) router.push({ name: 'order', params: { id: o.id } })
    else fetchData()
}

async function fetchData() {
    const id = Number(route.params.id)
    if (!id) return
    try {
        data.value = await Requests.getOne(id)
        if (data.value?.request) {
            editForm.name = data.value.request.name
            editForm.phone = data.value.request.phone
            editForm.comment = data.value.request.comment || ''
            editForm.type = data.value.request.type
        }
    } catch (e: any) {
        if (e?.response?.status === 404) router.push('/requests')
        toast.add({ severity: 'error', summary: 'Ошибка загрузки', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
}

async function fetchEmployees() {
    if (auth.role !== 'manager') return
    try {
        employees.value = await Employees.list({ 'pagination[pageSize]': 100 })
    } catch {
        // не критично
    }
}

async function doAccept() {
    if (!request.value) return
    try {
        await Requests.accept(request.value.id)
        await fetchData()
        toast.add({ severity: 'success', summary: 'Принята', life: 1500 })
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        if (code === 'ALREADY_TAKEN') {
            toast.add({ severity: 'warn', summary: 'Заявку уже приняли', life: 3000 })
            await fetchData()
        } else {
            toast.add({ severity: 'error', summary: 'Ошибка', detail: code || e?.message, life: 3000 })
        }
    }
}

async function reassignTo(employeeId: number | null) {
    if (!request.value) return
    try {
        await Requests.reassign(request.value.id, employeeId)
        await fetchData()
        toast.add({ severity: 'success', summary: employeeId ? 'Переназначена' : 'Снято назначение', life: 1500 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function toggleGoal(stateId: number, done: boolean) {
    if (!request.value || !canMutate.value) return
    try {
        await Requests.toggleGoal(request.value.id, stateId, done)
        await fetchData()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function removeGoal(stateId: number) {
    if (!request.value) return
    try {
        await Requests.removeGoalFromRequest(request.value.id, stateId)
        await fetchData()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function restoreGoals() {
    if (!request.value) return
    try {
        await Requests.restoreGoals(request.value.id)
        await fetchData()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function doLose() {
    if (!request.value) return
    if (!loseReason.value.trim()) return
    try {
        await Requests.lose(request.value.id, loseReason.value.trim(), loseNote.value.trim() || undefined)
        loseOpen.value = false
        toast.add({ severity: 'success', summary: 'Закрыта', life: 1500 })
        await fetchData()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function doReopen() {
    if (!request.value) return
    try {
        await Requests.reopen(request.value.id)
        await fetchData()
        toast.add({ severity: 'success', summary: 'Переоткрыта', life: 1500 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 3000 })
    }
}

async function saveEdit() {
    if (!request.value) return
    try {
        await Requests.patch(request.value.id, {
            name: editForm.name.trim(),
            phone: editForm.phone.trim(),
            comment: editForm.comment,
            type: editForm.type,
        })
        editOpen.value = false
        await fetchData()
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1500 })
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3000 })
    }
}

function fmtEvent(ev: RequestEvent): string {
    const t = new Date(ev.createdAt).toLocaleString('ru-RU')
    const who = ev.actor?.fullName || 'Система'
    switch (ev.kind) {
        case 'created': return `${t} · ${who}: заявка создана`
        case 'accepted': return `${t} · ${who}: принял(а) заявку`
        case 'reassigned': return `${t} · ${who}: переназначил(а)`
        case 'moved': return `${t} · ${who}: перенос между колонками`
        case 'patched': return `${t} · ${who}: правки`
        case 'lost': return `${t} · ${who}: закрыта (${ev.payload?.reason})`
        case 'reopened': return `${t} · ${who}: переоткрыта`
        case 'goal-toggled': return `${t} · ${who}: цель «${ev.payload?.goalText}» → ${ev.payload?.done ? 'выполнено' : 'снято'}`
        case 'goal-removed': return `${t} · ${who}: цель «${ev.payload?.goalText}» убрана`
        case 'goals-restored': return `${t} · ${who}: цели восстановлены`
        default: return `${t} · ${who}: ${ev.kind}`
    }
}

const kindLabel: Record<string, string> = {
    accepted: 'принял заявку',
    moved: 'перенёс заявку',
    patched: 'изменил поля',
    reassigned: 'переназначил',
    lost: 'закрыл без заказа',
    reopened: 'переоткрыл',
    converted: 'создал заказ',
    'goal-toggled': 'отметил цель',
    'goal-removed': 'удалил цель',
    'goals-restored': 'восстановил цели',
}

const offs: Array<() => void> = []
onMounted(() => {
    fetchData()
    fetchEmployees()
    const myId = () => Number(route.params.id)
    feed.markSeen(myId())

    offs.push(feed.onUpdated((e) => {
        if (e.requestId !== myId()) return
        if (e.actorId != null && e.actorId === auth.employee?.id) return
        if (isEditingLocally.value) {
            // Не перезаписываем — покажем кнопку «Обновить» в банере.
            const actorName = (data.value?.events || []).slice(-1)[0]?.actor?.fullName || 'коллега'
            liveBanner.value = { kind: e.kind, actorName }
            return
        }
        const actorName = (data.value?.events || []).slice(-1)[0]?.actor?.fullName || 'коллега'
        liveBanner.value = { kind: e.kind, actorName }
        fetchData()
        feed.markSeen(myId())
    }))
    offs.push(feed.onResync(() => fetchData()))
})
onBeforeUnmount(() => {
    for (const off of offs) try { off() } catch { /* noop */ }
})

function dismissBanner() { liveBanner.value = null }
async function refreshFromBanner() {
    await fetchData()
    liveBanner.value = null
}
</script>

<template>
    <AppTopbar :title="request?.code || 'Заявка'" :subtitle="request ? `${typeLabel} · ${request.source}` : ''" back="/requests">
        <template #actions>
            <template v-if="request">
                <Button v-if="canConvert" label="Создать заказ" icon="pi pi-plus" severity="primary"
                        @click="createOrderOpen = true" />
                <Button v-if="request.outcome === 'open' && !request.lockedAt" label="Закрыть без заказа"
                        severity="secondary" outlined icon="pi pi-times-circle" @click="loseOpen = true" />
                <Button v-if="request.outcome === 'lost' && auth.role === 'manager'" label="Переоткрыть"
                        severity="secondary" outlined icon="pi pi-replay" @click="doReopen" />
                <Button v-if="canMutate" label="Редактировать" icon="pi pi-pencil" @click="editOpen = true" />
            </template>
        </template>
    </AppTopbar>

    <div v-if="liveBanner"
         class="mx-8 mt-4 rounded-xl bg-saffron-300/15 text-ink-700 text-sm px-4 py-2 flex items-center gap-3">
        <i class="pi pi-sync text-saffron-500"></i>
        <span>Заявку изменил {{ liveBanner.actorName }}: {{ kindLabel[liveBanner.kind] || liveBanner.kind }}</span>
        <button v-if="isEditingLocally" class="ml-auto text-xs font-semibold text-tomato-500 hover:underline"
                type="button" @click="refreshFromBanner">
            Обновить
        </button>
        <button v-else class="ml-auto text-ink-400 hover:text-ink-700" type="button" @click="dismissBanner">
            <i class="pi pi-times text-xs"></i>
        </button>
    </div>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else-if="request" class="p-8 grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <div class="space-y-6">
            <div class="bg-white rounded-2xl p-6 space-y-3">
                <div class="font-display font-bold text-lg">{{ request.name }}</div>
                <a :href="`tel:${request.phone}`" class="text-ink-700 hover:text-tomato-500">{{ request.phone }}</a>
                <div v-if="request.sourceDetail" class="text-sm text-ink-400">Источник: {{ request.sourceDetail }}</div>
                <div v-if="(request.extra as any)?.duplicateOf" class="rounded-xl bg-tomato-500/10 text-tomato-500 px-3 py-2 text-sm">
                    Есть открытая заявка {{ (request.extra as any).duplicateOf }}
                </div>
                <div v-if="request.comment" class="text-sm text-ink-700 whitespace-pre-line">{{ request.comment }}</div>
            </div>

            <div v-if="request.values && request.values.length" class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold mb-3">Ответы формы</div>
                <div class="grid grid-cols-2 gap-3">
                    <div v-for="v in request.values" :key="v.key">
                        <div class="text-xs font-bold uppercase tracking-wider text-ink-400">{{ v.label }}</div>
                        <div class="text-sm">{{ v.value }}</div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-6">
                <div class="flex items-center mb-3">
                    <div class="font-display font-bold">Цели колонки</div>
                    <div class="ml-auto text-xs text-ink-400">{{ request.column?.name }}</div>
                </div>
                <div v-if="!liveGoals.length" class="text-sm text-ink-400">Нет целей для этой колонки</div>
                <ul class="space-y-2">
                    <li v-for="g in liveGoals" :key="g.id" class="flex items-center gap-3">
                        <input type="checkbox" :checked="g.done" :disabled="!canMutate" @change="toggleGoal(g.id, ($event.target as HTMLInputElement).checked)" />
                        <span :class="g.done ? 'line-through text-ink-400' : ''" class="flex-1 text-sm">{{ g.goalText }}</span>
                        <button v-if="canMutate" type="button" class="text-ink-400 hover:text-tomato-500 text-xs" @click="removeGoal(g.id)">убрать</button>
                    </li>
                </ul>
                <div v-if="removedGoals.length && canMutate" class="mt-3 text-right">
                    <button type="button" class="text-xs text-tomato-500 hover:underline" @click="restoreGoals">
                        Восстановить все цели
                    </button>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold mb-3">История</div>
                <div class="space-y-1 text-xs text-ink-500">
                    <div v-for="ev in events" :key="ev.id">{{ fmtEvent(ev) }}</div>
                    <div v-if="!events.length" class="text-ink-400">Пока нет событий</div>
                </div>
            </div>
        </div>

        <div class="space-y-6">
            <div class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold mb-2">Ответственный</div>
                <div v-if="request.assignee" class="text-sm">{{ request.assignee.fullName }}</div>
                <div v-else class="text-sm text-ink-400">Пока без ответственного</div>

                <div class="mt-4 flex flex-wrap gap-2">
                    <Button v-if="!request.acceptedAt && (auth.role === 'manager' || auth.role === 'duty')"
                            label="Принять" icon="pi pi-check" @click="doAccept" />
                </div>

                <div v-if="canReassign && employees.length" class="mt-4">
                    <div class="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">Переназначить</div>
                    <div class="flex flex-wrap gap-1">
                        <button v-for="e in employees.filter((x) => x.role === 'manager' || x.role === 'duty')"
                                :key="e.id" type="button"
                                class="rounded-lg px-2 py-1 text-xs border transition"
                                :class="request.assignee?.id === e.id ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                                @click="reassignTo(e.id)">
                            {{ e.fullName }}
                        </button>
                        <button v-if="request.assignee" type="button"
                                class="rounded-lg px-2 py-1 text-xs border border-tomato-500 text-tomato-500 hover:bg-tomato-500/10"
                                @click="reassignTo(null)">
                            Снять
                        </button>
                    </div>
                </div>
            </div>

            <div v-if="linkedOrder" class="bg-olive-500/10 text-olive-500 rounded-2xl p-4 text-sm">
                <div class="font-bold">Заказ оформлен</div>
                <RouterLink :to="'/orders'" class="mt-1 inline-flex items-center gap-1 font-mono hover:underline">
                    <i class="pi pi-receipt text-[11px]"></i> {{ linkedOrder.code }}
                </RouterLink>
            </div>
            <div v-else-if="request.lockedAt" class="bg-tomato-500/10 text-tomato-500 rounded-2xl p-4 text-sm">
                Заявка заблокирована (связана с заказом)
            </div>

            <div v-if="request.outcome === 'lost'" class="bg-ink-50 rounded-2xl p-4 text-sm">
                <div class="font-bold">Закрыта: {{ request.lostReason }}</div>
                <div v-if="request.lostNote" class="mt-1 text-ink-500">{{ request.lostNote }}</div>
            </div>
        </div>
    </div>

    <Dialog v-model:visible="loseOpen" modal header="Закрыть без заказа" :style="{ width: '440px' }" dismissable-mask>
        <div class="space-y-3">
            <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Причина *</label>
            <select v-model="loseReason" class="w-full rounded-xl border border-ink-200 px-4 py-2.5 bg-white focus:outline-none focus:border-ink-900">
                <option value="не дозвонились">не дозвонились</option>
                <option value="дорого">дорого</option>
                <option value="не наш район">не наш район</option>
                <option value="передумал">передумал</option>
                <option value="дубль">дубль</option>
                <option value="другое">другое</option>
            </select>
            <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Комментарий</label>
            <textarea v-model="loseNote" rows="3"
                      class="w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"></textarea>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="loseOpen = false" />
            <Button label="Закрыть заявку" severity="danger" icon="pi pi-check" @click="doLose" />
        </template>
    </Dialog>

    <Dialog v-model:visible="editOpen" modal header="Редактировать" :style="{ width: '440px' }" dismissable-mask>
        <div class="space-y-3">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Тип</label>
                <div class="mt-1 grid grid-cols-2 gap-2">
                    <button type="button"
                            class="rounded-xl py-2 text-sm font-semibold border transition"
                            :class="editForm.type === 'individual' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                            @click="editForm.type = 'individual'">Физлицо</button>
                    <button type="button"
                            class="rounded-xl py-2 text-sm font-semibold border transition"
                            :class="editForm.type === 'shop' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                            @click="editForm.type = 'shop'">Магазин</button>
                </div>
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Имя</label>
                <input v-model="editForm.name"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Телефон</label>
                <input v-model="editForm.phone"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Комментарий</label>
                <textarea v-model="editForm.comment" rows="3"
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"></textarea>
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="editOpen = false" />
            <Button label="Сохранить" icon="pi pi-check" @click="saveEdit" />
        </template>
    </Dialog>

    <CreateOrderDialog v-model:visible="createOrderOpen"
                       :prefill="orderPrefill"
                       @created="onOrderCreated" />
</template>
