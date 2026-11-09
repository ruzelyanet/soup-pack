<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppTopbar from '@/components/AppTopbar.vue'
import { Employees, Orders, type Order } from '@/services/resources'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const isNew = ref(route.params.id === 'new')
const loading = ref(!isNew.value)
const myOrders = ref<Order[]>([])

const form = reactive({
    documentId: '',
    id: 0,
    fullName: '',
    phone: '',
    role: 'courier' as 'manager' | 'duty' | 'courier',
    personalKey: 'KEY-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
})

onMounted(async () => {
    if (!isNew.value) {
        try {
            const [e, orders] = await Promise.all([
                Employees.get(route.params.id as string),
                Orders.list({
                    populate: ['employee', 'client'],
                    'filters[employee][documentId][$eq]': route.params.id,
                    sort: 'createdAt:desc',
                }),
            ])
            Object.assign(form, {
                documentId: e.documentId,
                id: e.id,
                fullName: e.fullName,
                phone: e.phone,
                role: e.role,
                personalKey: e.personalKey,
            })
            myOrders.value = orders
        } catch (e: any) {
            toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.message, life: 3000 })
        } finally {
            loading.value = false
        }
    }
})

function regenKey() {
    form.personalKey = 'KEY-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

async function save() {
    const data = {
        fullName: form.fullName,
        phone: form.phone,
        role: form.role,
        personalKey: form.personalKey,
    }
    try {
        if (isNew.value) {
            await Employees.create(data as any)
        } else {
            await Employees.update(form.documentId, data as any)
        }
        toast.add({ severity: 'success', summary: isNew.value ? 'Создан' : 'Сохранён', life: 1800 })
        router.push('/employees')
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 3500 })
    }
}

function fmt(v: number) {
    return new Intl.NumberFormat('ru-RU').format(v) + ' сум'
}
</script>

<template>
    <AppTopbar :title="isNew ? 'Новый сотрудник' : form.fullName || 'Карточка'"
               :subtitle="isNew ? 'Заполните карточку' : 'Карточка сотрудника'"
               back="/employees">
        <template #actions>
            <Button label="Отмена" severity="secondary" outlined @click="router.back()" />
            <Button :label="isNew ? 'Создать' : 'Сохранить'" icon="pi pi-check" severity="primary" @click="save" />
        </template>
    </AppTopbar>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else class="p-8 grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <div class="space-y-6">
            <div class="bg-white rounded-2xl p-6 space-y-4">
                <div class="font-display font-bold">Профиль</div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-ink-400">ФИО</label>
                        <input v-model="form.fullName"
                               class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    </div>
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Телефон</label>
                        <input v-model="form.phone"
                               class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    </div>
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Роль</label>
                    <div class="mt-2 grid grid-cols-3 gap-2">
                        <button type="button" class="rounded-xl py-3 text-sm font-semibold border transition"
                                :class="form.role === 'manager' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                                @click="form.role = 'manager'">Главный</button>
                        <button type="button" class="rounded-xl py-3 text-sm font-semibold border transition"
                                :class="form.role === 'duty' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                                @click="form.role = 'duty'">Оператор (офис)</button>
                        <button type="button" class="rounded-xl py-3 text-sm font-semibold border transition"
                                :class="form.role === 'courier' ? 'bg-ink-900 text-cream-50 border-ink-900' : 'border-ink-200 hover:border-ink-400'"
                                @click="form.role = 'courier'">Курьер</button>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold mb-3">История заказов</div>
                <div v-if="!myOrders.length" class="text-sm text-ink-400">
                    Пока не обработано ни одного заказа.
                </div>
                <div v-else class="space-y-2">
                    <div v-for="o in myOrders" :key="o.id"
                         class="flex items-center justify-between py-2 border-b border-ink-100 last:border-0">
                        <div>
                            <div class="font-semibold text-sm">{{ o.code }} · {{ o.client?.fullName }}</div>
                            <div class="text-xs text-ink-400">
                                {{ new Date(o.createdAt).toLocaleString('ru-RU') }}
                            </div>
                        </div>
                        <div class="font-semibold">{{ fmt(Number(o.total)) }}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="space-y-6">
            <div class="bg-white rounded-2xl p-6">
                <div class="font-display font-bold mb-3">Персональный ключ</div>
                <template v-if="form.personalKey && !form.personalKey.startsWith('scrypt$')">
                    <div class="bg-ink-900 text-cream-50 rounded-xl p-4 font-mono text-sm break-all">
                        {{ form.personalKey }}
                    </div>
                    <div class="text-xs text-ink-400 mt-2">
                        Сообщите этот ключ сотруднику — он понадобится при логине в админку
                        (телефон + ключ на <code>/admin/login</code>).
                    </div>
                </template>
                <template v-else>
                    <div class="bg-saffron-300/20 text-ink-900 rounded-xl p-4 text-sm">
                        Ключ был создан старой версией (scrypt-хэш, plain не читается).
                        Нажмите «Сгенерировать новый» и сохраните — новый сразу будет видно.
                    </div>
                </template>
                <Button label="Сгенерировать новый" severity="secondary" outlined class="mt-3 w-full"
                        icon="pi pi-refresh" @click="regenKey" />
            </div>
        </div>
    </div>
</template>
