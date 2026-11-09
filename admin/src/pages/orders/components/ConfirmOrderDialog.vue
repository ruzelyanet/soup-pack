<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import type { Order } from '@/services/resources'

const props = defineProps<{ visible: boolean; order: Order | null }>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'confirm', note: string): void
}>()

const composition = ref(false)
const address = ref(false)
const time = ref(false)
const payment = ref(false)
const note = ref('')

watch(() => props.visible, (v) => {
    if (v) {
        composition.value = false
        address.value = false
        time.value = false
        payment.value = false
        note.value = ''
    }
})

const allChecked = computed(() => composition.value && address.value && time.value && payment.value)

const timeLabel = computed(() => {
    const o = props.order
    if (!o) return ''
    if (o.deliveryMethod === 'preorder' && o.deliverySlotAt) {
        return 'Предзаказ на ' + new Date(o.deliverySlotAt).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
    }
    return 'Курьером сейчас'
})

const paymentLabel = computed(() => {
    const m = props.order?.paymentMethod
    const map: Record<string, string> = { cash: 'наличные', card: 'карта', click: 'Click', payme: 'Payme', transfer: 'перевод' }
    return m ? (map[m] || m) : '—'
})

function doConfirm() {
    if (!allChecked.value) return
    emit('confirm', note.value.trim())
    emit('update:visible', false)
}

async function copyPhone() {
    const phone = props.order?.client?.phone
    if (!phone) return
    try { await navigator.clipboard.writeText(phone) } catch { /* noop */ }
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v: boolean) => emit('update:visible', v)"
            modal dismissableMask
            :header="'Подтверждение заказа ' + (order?.code || '')"
            :style="{ width: '480px' }">
        <div class="space-y-4 pt-1" v-if="order">
            <div class="bg-ink-50 rounded-xl p-3">
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400">Клиент</div>
                <div class="mt-1 flex items-center gap-2">
                    <a :href="`tel:${order.client?.phone}`"
                       class="font-display font-bold text-lg text-ink-900 hover:underline">
                        {{ order.client?.phone || '—' }}
                    </a>
                    <button class="ml-auto text-xs text-ink-500 hover:text-ink-900"
                            type="button" @click="copyPhone">
                        <i class="pi pi-copy text-xs"></i> Скопировать
                    </button>
                </div>
                <div class="text-sm text-ink-500 mt-0.5">{{ order.client?.fullName }}</div>
            </div>

            <div class="space-y-2">
                <label class="flex items-start gap-2 cursor-pointer">
                    <input v-model="composition" type="checkbox" class="accent-olive-500 mt-1" />
                    <div class="text-sm">
                        <div class="font-semibold">Состав и количество</div>
                        <div class="text-xs text-ink-500">
                            Проговорите, что заказал клиент; при расхождении — скорректируйте.
                        </div>
                    </div>
                </label>
                <label class="flex items-start gap-2 cursor-pointer">
                    <input v-model="address" type="checkbox" class="accent-olive-500 mt-1" />
                    <div class="text-sm">
                        <div class="font-semibold">Адрес</div>
                        <div class="text-xs text-ink-500">{{ order.address || '—' }}</div>
                    </div>
                </label>
                <label class="flex items-start gap-2 cursor-pointer">
                    <input v-model="time" type="checkbox" class="accent-olive-500 mt-1" />
                    <div class="text-sm">
                        <div class="font-semibold">Время доставки</div>
                        <div class="text-xs text-ink-500">{{ timeLabel }}</div>
                    </div>
                </label>
                <label class="flex items-start gap-2 cursor-pointer">
                    <input v-model="payment" type="checkbox" class="accent-olive-500 mt-1" />
                    <div class="text-sm">
                        <div class="font-semibold">Способ оплаты</div>
                        <div class="text-xs text-ink-500">{{ paymentLabel }}</div>
                    </div>
                </label>
            </div>

            <div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-400 mb-1">Комментарий (необязательно)</div>
                <Textarea v-model="note" rows="2" autoResize class="w-full"
                          placeholder="Например: клиент попросил перенести время" />
            </div>
        </div>
        <template #footer>
            <Button label="Назад" severity="secondary" outlined @click="emit('update:visible', false)" />
            <Button label="Клиент подтвердил" icon="pi pi-check" :disabled="!allChecked" @click="doConfirm" />
        </template>
    </Dialog>
</template>
