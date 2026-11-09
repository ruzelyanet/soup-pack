<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { Transactions } from '@/services/transactions'
import type { Order, PaymentMethod } from '@/services/resources'

const props = defineProps<{
    visible: boolean
    order: Order | null
}>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'saved'): void
}>()

const toast = useToast()

const method = ref<PaymentMethod>('cash')
const amount = ref<number>(0)
const reason = ref('')
const saving = ref(false)
const idempotencyKey = ref('')

const paidAmount = computed(() => Number(props.order?.paidAmount ?? 0))

watch(() => props.visible, (v) => {
    if (!v) return
    method.value = (props.order?.paymentMethod as PaymentMethod | undefined) ?? 'cash'
    amount.value = paidAmount.value
    reason.value = ''
    idempotencyKey.value = crypto.randomUUID()
})

function fmt(n: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' сум'
}

async function save() {
    if (!props.order) return
    if (amount.value <= 0 || amount.value > paidAmount.value) {
        toast.add({ severity: 'warn', summary: 'Сумма возврата некорректна', life: 2500 })
        return
    }
    if (!reason.value.trim()) {
        toast.add({ severity: 'warn', summary: 'Укажите причину возврата', life: 2500 })
        return
    }
    saving.value = true
    try {
        await Transactions.createRefund(props.order.id, {
            amount: amount.value,
            method: method.value,
            comment: reason.value.trim(),
            idempotencyKey: idempotencyKey.value,
        })
        emit('saved')
        emit('update:visible', false)
        toast.add({ severity: 'success', summary: 'Возврат оформлен', life: 1500 })
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        toast.add({ severity: 'error', summary: 'Ошибка', detail: code || e?.message, life: 3500 })
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)"
            modal :header="`Возврат по заказу ${order?.code || ''}`"
            :style="{ width: '440px' }" dismissable-mask>
        <div class="space-y-3">
            <div class="bg-ink-50 rounded-xl p-3 text-sm space-y-1">
                <div class="flex justify-between font-semibold">
                    <span>Можно вернуть до</span><span>{{ fmt(paidAmount) }}</span>
                </div>
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Способ</label>
                <select v-model="method" class="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5">
                    <option value="cash">Наличные</option>
                    <option value="card">Карта</option>
                    <option value="click">Click</option>
                    <option value="payme">Payme</option>
                    <option value="transfer">Перевод</option>
                </select>
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Сумма *</label>
                <input v-model.number="amount" type="number" min="1" :max="paidAmount"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
            </div>
            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Причина *</label>
                <textarea v-model="reason" rows="3"
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"></textarea>
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="emit('update:visible', false)" />
            <Button :label="saving ? 'Сохранение…' : 'Вернуть'" severity="danger" :disabled="saving" icon="pi pi-undo" @click="save" />
        </template>
    </Dialog>
</template>
