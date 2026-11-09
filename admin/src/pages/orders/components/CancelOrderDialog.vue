<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { StaffOrders, orderErrorText } from '@/services/orders'
import type { Order, Transaction } from '@/services/resources'

/** Отмена заказа с обязательной причиной. Сервер сторнирует все проведённые транзакции заказа. */
const props = defineProps<{
    visible: boolean
    order: Order | null
    /** Транзакции заказа (если уже загружены) — чтобы показать, что будет сторнировано. */
    transactions?: Transaction[]
}>()
const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'canceled', order: Order): void
}>()

const toast = useToast()
const reason = ref('')
const saving = ref(false)
const textareaEl = ref<HTMLTextAreaElement | null>(null)

const QUICK_REASONS = ['Клиент передумал', 'Не дозвонились до клиента', 'Нет позиций в наличии', 'Дубль заказа']
const MAX = 250

watch(() => props.visible, (v) => {
    if (!v) return
    reason.value = ''
    saving.value = false
    setTimeout(() => textareaEl.value?.focus(), 50)
})

/** Проведённые транзакции: из пропса, иначе из populate заказа. */
const liveTxns = computed(() => {
    const list = (props.transactions?.length ? props.transactions : (props.order as any)?.transactions) || []
    return (list as Transaction[]).filter((t) => t.status === 'completed')
})
const paidAmount = computed(() => Number(props.order?.paidAmount ?? 0))

const canSubmit = computed(() => reason.value.trim().length > 0 && reason.value.trim().length <= MAX && !saving.value)

function pick(r: string) {
    reason.value = r
    textareaEl.value?.focus()
}

async function submit() {
    if (!props.order || !canSubmit.value) return
    saving.value = true
    try {
        const updated = await StaffOrders.cancel(props.order.id, reason.value.trim())
        const n = liveTxns.value.length
        toast.add({
            severity: 'success',
            summary: `Заказ ${props.order.code} отменён`,
            detail: n ? `Сторнировано транзакций: ${n}` : undefined,
            life: 2500,
        })
        emit('canceled', updated)
        emit('update:visible', false)
    } catch (e: any) {
        const code = e?.response?.data?.error?.message
        toast.add({ severity: 'error', summary: 'Не удалось отменить', detail: orderErrorText(code) || code || e?.message, life: 3500 })
    } finally {
        saving.value = false
    }
}

function fmt(n: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(Number(n || 0))) + ' сум'
}
const METHOD: Record<string, string> = { cash: 'Наличные', card: 'Карта', click: 'Click', payme: 'Payme', transfer: 'Перевод' }
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v: boolean) => emit('update:visible', v)"
            modal :draggable="false" :show-header="false" :style="{ width: 'min(520px, 94vw)' }"
            :pt="{ root: { class: '!rounded-2xl !border-0' }, content: { class: '!p-6' } }">
        <form v-if="order" class="flex flex-col gap-4 text-ink-900" @submit.prevent="submit">
            <div class="flex flex-col gap-1">
                <h2 class="m-0 font-display font-extrabold text-xl">Отменить заказ {{ order.code }}?</h2>
                <span class="text-sm text-ink-500">
                    {{ fmt(Number(order.total)) }}<template v-if="order.client?.fullName"> · {{ order.client.fullName }}</template>
                </span>
            </div>

            <label class="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-700">
                <span>Причина отмены <span class="font-medium text-ink-400">— обязательно, видна клиенту</span></span>
                <textarea ref="textareaEl" v-model="reason" rows="3" :maxlength="MAX"
                          placeholder="Например: клиент передумал"
                          class="px-3 py-2.5 rounded-xl border-[1.5px] border-ink-200 text-[15px] font-normal text-ink-900 resize-none focus:outline-none focus:border-ink-900"
                          @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit"></textarea>
            </label>
            <div class="flex flex-wrap gap-1.5 -mt-1">
                <button v-for="r in QUICK_REASONS" :key="r" type="button"
                        class="h-8 px-3 rounded-full border border-ink-200 bg-white text-[13px] hover:border-ink-400 transition"
                        @click="pick(r)">{{ r }}</button>
            </div>

            <div v-if="liveTxns.length || paidAmount > 0" class="flex flex-col gap-2 p-3.5 rounded-2xl bg-[#fdece8] text-sm">
                <div class="flex items-center gap-2 font-bold text-[#651d15]">
                    <i class="pi pi-exclamation-triangle text-sm"></i>
                    Транзакции заказа будут сторнированы
                </div>
                <div v-for="t in liveTxns" :key="t.id" class="flex items-center gap-2 text-[13px] text-ink-700">
                    <span class="font-mono">{{ t.code }}</span>
                    <span class="font-semibold">{{ t.kind === 'refund' ? '−' : '+' }}{{ fmt(Number(t.amount)) }}</span>
                    <span class="text-ink-500">{{ METHOD[t.method] || t.method }}</span>
                </div>
                <span v-if="paidAmount > 0" class="text-[13px] text-[#651d15]">
                    Если клиент уже заплатил — верните ему {{ fmt(paidAmount) }}. После отмены оплата заказа станет 0.
                </span>
            </div>

            <div class="flex justify-end gap-2 mt-1">
                <button type="button"
                        class="h-11 px-4 rounded-xl border border-ink-200 bg-white text-[15px] font-semibold hover:border-ink-400 transition"
                        @click="emit('update:visible', false)">Не отменять</button>
                <button type="submit" :disabled="!canSubmit"
                        class="h-11 px-4 rounded-xl bg-tomato-600 hover:bg-[#8a281e] disabled:opacity-50 text-white text-[15px] font-bold flex items-center gap-2 transition">
                    <i v-if="saving" class="pi pi-spin pi-spinner text-sm"></i>
                    Отменить заказ
                </button>
            </div>
        </form>
    </Dialog>
</template>
