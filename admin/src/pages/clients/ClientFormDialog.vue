<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import SelectButton from 'primevue/selectbutton'
import PhoneInput from '@/components/PhoneInput.vue'
import AddressPicker from '@/components/AddressPicker.vue'
import { Clients, type Client } from '@/services/resources'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
    visible: boolean
    client: Client | null   // null → создание; иначе редактирование
}>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'saved', c: Client): void
}>()

const toast = useToast()
const saving = ref(false)

const GENDER_OPTIONS = [
    { label: 'Мужской', value: 'male' },
    { label: 'Женский', value: 'female' },
]

const form = reactive({
    fullName: '',
    phone: '+998 ',
    birthDate: null as Date | null,
    telegramUsername: '',
    gender: null as 'male' | 'female' | null,
    source: '',
    address: '',
    lat: null as number | null,
    lng: null as number | null,
})

watch(() => props.visible, (v) => {
    if (!v) return
    const c = props.client
    form.fullName = c?.fullName || ''
    form.phone = c?.phone || '+998 '
    form.birthDate = c?.birthDate ? new Date(c.birthDate) : null
    form.telegramUsername = c?.telegramUsername || ''
    form.gender = (c?.gender as any) || null
    form.source = c?.source || ''
    form.address = c?.address || ''
    form.lat = c?.lat != null ? Number(c.lat) : null
    form.lng = c?.lng != null ? Number(c.lng) : null
})

async function save() {
    if (!form.fullName.trim()) {
        toast.add({ severity: 'warn', summary: 'Введите ФИО', life: 1800 })
        return
    }
    if (form.phone.replace(/\D/g, '').length < 12) {
        toast.add({ severity: 'warn', summary: 'Введите телефон полностью', life: 1800 })
        return
    }
    saving.value = true
    try {
        const payload: Record<string, any> = {
            fullName: form.fullName.trim(),
            phone: form.phone,
            birthDate: form.birthDate ? form.birthDate.toISOString().slice(0, 10) : null,
            telegramUsername: form.telegramUsername.trim().replace(/^@/, '') || null,
            gender: form.gender,
            source: form.source.trim() || null,
            address: form.address.trim() || null,
            lat: form.lat,
            lng: form.lng,
        }

        let saved: Client
        if (props.client) {
            saved = await Clients.update(props.client.documentId, payload as any)
        } else {
            saved = await Clients.create(payload as any)
        }
        emit('saved', saved)
        emit('update:visible', false)
        toast.add({ severity: 'success', summary: props.client ? 'Сохранено' : 'Клиент создан', life: 1500 })
    } catch (e: any) {
        toast.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message,
            life: 3000,
        })
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v: boolean) => emit('update:visible', v)"
            modal dismissable-mask :header="client ? 'Редактировать клиента' : 'Новый клиент'"
            :style="{ width: '760px' }" :pt="{ root: { class: 'rounded-2xl' } }">
        <div>
            <div class="space-y-3">
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">ФИО</label>
                    <input v-model="form.fullName" autofocus
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Дата рождения</label>
                    <DatePicker v-model="form.birthDate" show-icon fluid date-format="dd.mm.yy"
                                :max-date="new Date()" class="mt-1 w-full" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Телефон</label>
                    <PhoneInput v-model="form.phone"
                                input-class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Telegram</label>
                    <div class="mt-1 flex items-center rounded-xl border border-ink-200 focus-within:border-ink-900 overflow-hidden">
                        <span class="pl-3 text-ink-400">@</span>
                        <input v-model="form.telegramUsername"
                               class="flex-1 px-2 py-2.5 focus:outline-none" placeholder="username" />
                    </div>
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Пол</label>
                    <SelectButton v-model="form.gender" :options="GENDER_OPTIONS"
                                  option-label="label" option-value="value"
                                  class="mt-1 flex w-full [&_button]:flex-1" />
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Адрес</label>
                    <div class="mt-1">
                        <AddressPicker
                            :address="form.address" :lat="form.lat" :lng="form.lng"
                            @update:address="(v) => form.address = v"
                            @update:lat="(v) => form.lat = v"
                            @update:lng="(v) => form.lng = v" />
                    </div>
                </div>
                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Откуда пришёл</label>
                    <input v-model="form.source"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"
                           placeholder="Instagram, рекомендация, Яндекс…" />
                </div>
            </div>
        </div>

        <template #footer>
            <div class="pt-4 flex justify-end gap-2 w-full">
                <Button label="Отмена" severity="secondary" text @click="emit('update:visible', false)" />
                <Button :label="client ? 'Сохранить' : 'Создать'" icon="pi pi-check"
                        severity="primary" :disabled="saving" @click="save" />
            </div>
        </template>
    </Dialog>
</template>
