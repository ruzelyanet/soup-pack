<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppTopbar from '@/components/AppTopbar.vue'
import PhoneInput from '@/components/PhoneInput.vue'
import { api } from '@/services/api'
import type { ShopContact } from '@/services/resources'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const err = ref<string | null>(null)

const form = ref<ShopContact>({
    phone: '',
    workHours: 'Ежедневно 9:00 — 23:00',
    city: 'Ташкент',
})

async function reload() {
    loading.value = true
    err.value = null
    try {
        const res = await api.get('/staff/shop-contact')
        const d = res.data?.data
        if (d) {
            form.value = {
                phone: d.phone || '',
                workHours: d.workHours || '',
                city: d.city || '',
            }
        }
    } catch (e: any) {
        err.value = e?.response?.status
            ? `${e.response.status} ${e.response.statusText}: ${e?.response?.data?.error?.message || ''}`
            : 'Нет связи с API — запустите backend (cd backend && npm run develop)'
    } finally {
        loading.value = false
    }
}
onMounted(reload)

async function save() {
    saving.value = true
    try {
        await api.put('/staff/shop-contact', {
            data: {
                phone: (form.value.phone || '').trim(),
                workHours: (form.value.workHours || '').trim(),
                city: (form.value.city || '').trim(),
            },
        })
        toast.add({ severity: 'success', summary: 'Сохранено', life: 1800 })
        await reload()
    } catch (e: any) {
        toast.add({
            severity: 'error', summary: 'Ошибка',
            detail: e?.response?.data?.error?.message || e?.message, life: 3500,
        })
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <AppTopbar title="Контакты магазина"
               subtitle="Телефон для звонка-заказа. Показывается в шапке каталога и на странице «О нас».">
        <template #actions>
            <Button label="Сохранить" icon="pi pi-check" severity="primary"
                    :loading="saving" @click="save" />
        </template>
    </AppTopbar>

    <div v-if="loading" class="p-8 text-ink-400">Загрузка…</div>

    <div v-else class="p-8 grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 max-w-[1100px]">
        <div class="space-y-6">
            <div class="bg-white rounded-2xl p-6 space-y-4">
                <div v-if="err" class="bg-tomato-500/10 text-tomato-600 rounded-xl p-4 text-sm">
                    {{ err }}
                </div>

                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">
                        Телефон для звонка-заказа
                    </label>
                    <PhoneInput v-model="form.phone"
                                input-class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    <div class="text-xs text-ink-400 mt-1.5">
                        Клиент видит этот номер прямо под поиском на главной —
                        тап по кнопке открывает звонок.
                    </div>
                </div>

                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">
                        Часы работы
                    </label>
                    <input v-model="form.workHours"
                           placeholder="Ежедневно 9:00 — 23:00"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                    <div class="text-xs text-ink-400 mt-1.5">
                        Показывается на странице «О нас».
                    </div>
                </div>

                <div>
                    <label class="text-xs font-bold uppercase tracking-wider text-ink-400">
                        Город
                    </label>
                    <input v-model="form.city"
                           placeholder="Ташкент"
                           class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 focus:outline-none focus:border-ink-900" />
                </div>
            </div>
        </div>

        <!-- Превью -->
        <div class="bg-white rounded-2xl p-6 space-y-4 h-fit sticky top-24">
            <div class="font-display font-bold">Как это увидит клиент</div>
            <div class="rounded-2xl bg-tomato-500 text-white p-4 flex items-center gap-3">
                <div class="size-12 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <span class="pi pi-phone text-xl"></span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-extrabold uppercase tracking-wider opacity-90">
                        Позвонить и заказать
                    </div>
                    <div class="font-display font-black text-lg leading-tight truncate">
                        {{ form.phone || '— не указан —' }}
                    </div>
                </div>
                <span class="pi pi-chevron-right opacity-80"></span>
            </div>
            <div class="text-[12px] text-ink-400">
                Если поле пустое — блок на клиенте скрывается.
            </div>
        </div>
    </div>
</template>
