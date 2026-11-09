<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { Transactions } from '@/services/transactions'
import type { Order, PaymentMethod } from '@/services/resources'
import { useAuth } from '@/stores/auth'

const props = defineProps<{
    visible: boolean
    order: Order | null
}>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'saved'): void
}>()

const toast = useToast()
const auth = useAuth()

const method = ref<PaymentMethod>('cash')
const amount = ref<number>(0)
const comment = ref('')
const allowOverpay = ref(false)
const saving = ref(false)
const idempotencyKey = ref('')

const total = computed(() => Number(props.order?.total ?? 0))
const paidAmount = computed(() => Number(props.order?.paidAmount ?? 0))
const remainder = computed(() => Math.max(0, total.value - paidAmount.value))
const exceeds = computed(() => amount.value > remainder.value)

watch(() => props.visible, (v) => {
    if (!v) return
    method.value = (props.order?.paymentMethod as PaymentMethod | undefined) ?? 'cash'
    amount.value = remainder.value
    comment.value = ''
    allowOverpay.value = false
    // Один ключ на весь жизненный цикл диалога — защита от двойного клика.
    idempotencyKey.value = crypto.randomUUID()
})

function fmt(n: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' сум'
}

async function save() {
    if (!props.order) return
    if (amount.value <= 0) {
        toast.add({ severity: 'warn', summary: 'Сумма должна быть положительной', life: 2500 })
        return
    }
    saving.value = true
    try {
        await Transactions.createPayment(props.order.id, {
            amount: amount.value,
            method: method.value,
            comment: comment.value.trim() || null,
            idempotencyKey: idempotencyKey.value,
            allowOverpay: allowOverpay.value,
        })
        emit('saved')
        emit('update:visible', false)
        toast.add({ severity: 'success', summary: 'Оплата принята', life: 1500 })
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        const map: Record<string, string> = {
            AMOUNT_EXCEEDS_BALANCE: 'Сумма больше остатка. Отметьте «переплата» (manager) или уменьшите.',
            ORDER_CANCELED: 'Нельзя принять оплату на отменённый заказ.',
            FORBIDDEN_ROLE: 'Недостаточно прав.',
        }
        toast.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: map[code] || code || e?.message,
            life: 3500,
        })
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v) => emit('update:visible', v)"
            modal :header="`Принять оплату · ${order?.code || ''}`"
            :style="{ width: '440px' }" dismissable-mask>
        <div class="space-y-3">
            <div class="bg-ink-50 rounded-xl p-3 text-sm space-y-1">
                <div class="flex justify-between"><span class="text-ink-500">Сумма заказа</span><span>{{ fmt(total) }}</span></div>
                <div class="flex justify-between"><span class="text-ink-500">Оплачено</span><span>{{ fmt(paidAmount) }}</span></div>
                <div class="flex justify-between font-semibold border-t border-ink-200 pt-1 mt-1">
                    <span>Остаток</span><span>{{ fmt(remainder) }}</span>
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
                <input v-model.number="amount" type="number" min="1"
                       class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900" />
                <div v-if="exceeds" class="mt-1 text-xs text-tomato-500">
                    Больше остатка на {{ fmt(amount - remainder) }}.
                    <span v-if="auth.role !== 'manager'">Только manager может принять переплату.</span>
                </div>
            </div>

            <label v-if="exceeds && auth.role === 'manager'" class="flex items-center gap-2 text-sm">
                <input v-model="allowOverpay" type="checkbox" />
                Переплата — зафиксировать как `overpaid`
            </label>

            <div>
                <label class="text-xs font-bold uppercase tracking-wider text-ink-400">Комментарий</label>
                <textarea v-model="comment" rows="2"
                          class="mt-1 w-full rounded-xl border border-ink-200 px-4 py-2.5 focus:outline-none focus:border-ink-900"></textarea>
            </div>
        </div>
        <template #footer>
            <Button label="Отмена" severity="secondary" outlined @click="emit('update:visible', false)" />
            <Button :label="saving ? 'Сохранение…' : 'Принять'" :disabled="saving" icon="pi pi-check" @click="save" />
        </template>
    </Dialog>
</template>
