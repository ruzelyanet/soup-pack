<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppTopbar from '@/components/AppTopbar.vue'
import { DeliveryMethods, type DeliveryMethod } from '@/services/resources'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const toast = useToast()
const confirm = useConfirm()
const list = ref<DeliveryMethod[]>([])
const loading = ref(true)

async function reload() {
    loading.value = true
    try {
        list.value = (await DeliveryMethods.list({ sort: 'sort:asc' })) as DeliveryMethod[]
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить', detail: e?.message, life: 2500 })
    } finally {
        loading.value = false
    }
}
onMounted(reload)

const dialog = ref(false)
const editing = ref<DeliveryMethod | null>(null)
const form = reactive({ name: '', code: '', active: true, price: 0, sort: 0, description: '' })

function openCreate() {
    editing.value = null
    Object.assign(form, { name: '', code: '', active: true, price: 0, sort: list.value.length * 10, description: '' })
    dialog.value = true
}
function openEdit(m: DeliveryMethod) {
    editing.value = m
    Object.assign(form, {
        name: m.name || '',
        code: m.code || '',
        active: m.active !== false,
        price: Number(m.price || 0),
        sort: Number(m.sort || 0),
        description: m.description || '',
    })
    dialog.value = true
}
async function save() {
    if (!form.name.trim()) { toast.add({ severity: 'warn', summary: 'Введите название', life: 1800 }); return }
    if (!form.code.trim()) { toast.add({ severity: 'warn', summary: 'Введите код', life: 1800 }); return }
    const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        active: form.active,
        price: Number(form.price || 0),
        sort: Number(form.sort || 0),
        description: form.description.trim() || null,
    }
    try {
        if (editing.value) {
            await DeliveryMethods.update(editing.value.documentId, payload as any)
        } else {
            await DeliveryMethods.create(payload as any)
        }
        dialog.value = false
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1500 })
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.response?.data?.error?.message || e?.message, life: 2500 })
    }
}
function askDelete(m: DeliveryMethod) {
    confirm.require({
        header: 'Удалить способ доставки?',
        message: `«${m.name}» — удаление необратимо. Старые заказы, где использовался этот способ, продолжат отображать его код.`,
        acceptLabel: 'Удалить', rejectLabel: 'Отмена',
        acceptProps: { severity: 'danger' },
        accept: async () => {
            try {
                await DeliveryMethods.remove(m.documentId)
                await reload()
            } catch (e: any) {
                toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 2500 })
            }
        },
    })
}

async function toggleActive(m: DeliveryMethod) {
    try {
        await DeliveryMethods.update(m.documentId, { active: !m.active } as any)
        await reload()
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Ошибка', detail: e?.message, life: 2500 })
    }
}

function fmt(v: number | undefined) {
    return new Intl.NumberFormat('ru-RU').format(Number(v || 0))
}
</script>

<template>
    <AppTopbar title="Способы доставки" subtitle="Настраиваемые варианты для заказов и фильтров скидок">
        <template #actions>
            <Button icon="pi pi-plus" label="Способ" severity="primary" rounded @click="openCreate" />
        </template>
    </AppTopbar>

    <div class="p-8 space-y-4">
        <div v-if="!loading && !list.length" class="bg-white rounded-2xl p-10 text-center">
            <i class="pi pi-truck text-3xl text-ink-300 block mb-3" />
            <div class="font-display font-bold text-lg">Пока нет способов доставки</div>
            <div class="text-sm text-ink-500 mt-1">Создайте первый — например, «Наш курьер» (код <code>courier_now</code>) или «Яндекс-доставка» (код <code>yandex</code>).</div>
            <Button label="Создать способ" icon="pi pi-plus" severity="primary" class="mt-4" @click="openCreate" />
        </div>

        <div v-else class="bg-white rounded-2xl overflow-hidden">
            <DataTable :value="list" :loading="loading" data-key="id">
                <Column header="Активен" style="width: 110px">
                    <template #body="{ data }">
                        <ToggleSwitch :model-value="data.active" @update:model-value="toggleActive(data)" />
                    </template>
                </Column>
                <Column header="Название">
                    <template #body="{ data }">
                        <div class="font-semibold">{{ data.name }}</div>
                        <div v-if="data.description" class="text-xs text-ink-400 mt-0.5">{{ data.description }}</div>
                    </template>
                </Column>
                <Column header="Код" style="width: 180px">
                    <template #body="{ data }">
                        <code class="text-xs bg-ink-50 rounded px-2 py-1">{{ data.code }}</code>
                    </template>
                </Column>
                <Column header="Цена" style="width: 140px" class="text-right">
                    <template #body="{ data }">
                        <span class="font-semibold">{{ fmt(data.price) }} <span class="text-xs text-ink-400">UZS</span></span>
                    </template>
                </Column>
                <Column header="Порядок" style="width: 100px" class="text-right">
                    <template #body="{ data }">{{ data.sort ?? 0 }}</template>
                </Column>
                <Column header="" style="width: 120px">
                    <template #body="{ data }">
                        <div class="flex gap-1 justify-end">
                            <Button icon="pi pi-pencil" severity="secondary" text rounded @click="openEdit(data)" />
                            <Button icon="pi pi-trash" severity="danger" text rounded @click="askDelete(data)" />
                        </div>
                    </template>
                </Column>
            </DataTable>
        </div>
    </div>

    <Dialog v-model:visible="dialog" modal dismissable-mask
            :header="editing ? 'Редактировать способ' : 'Новый способ доставки'"
            :style="{ width: '520px' }" :pt="{ root: { class: 'rounded-2xl' } }">
        <div class="space-y-3">
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Название</label>
                <input v-model="form.name" autofocus placeholder="Наш курьер / Яндекс-доставка / Самовывоз"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Код (латиница, уникальный)</label>
                <input v-model="form.code" placeholder="courier_now, yandex, pickup…"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-ink-900" />
                <div class="text-xs text-ink-400 mt-1">Используется в фильтрах скидок и в API.</div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Цена (UZS)</label>
                    <input v-model.number="form.price" type="number" min="0"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Порядок</label>
                    <input v-model.number="form.sort" type="number"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Описание</label>
                <textarea v-model="form.description" rows="2"
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
            </div>
            <div class="flex items-center gap-2">
                <ToggleSwitch v-model="form.active" />
                <span class="text-sm">Активен</span>
            </div>
        </div>
        <template #footer>
            <div class="pt-4 flex justify-end gap-2 w-full">
                <Button label="Отмена" severity="secondary" text @click="dialog = false" />
                <Button :label="editing ? 'Сохранить' : 'Создать'" icon="pi pi-check" severity="primary" @click="save" />
            </div>
        </template>
    </Dialog>
</template>
