<script setup lang="ts">
import Drawer from 'primevue/drawer'
import type { Order, OrderStatus, Transaction } from '@/services/resources'
import OrderDetails from './OrderDetails.vue'

/** Боковая панель заказа в списке. Содержимое — общий `OrderDetails` (тот же, что на странице заказа). */
const props = defineProps<{
    order: Order | null
    events: any[]
    transactions: Transaction[]
    panelBanner?: { text: string } | null
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'take'): void
    (e: 'confirm', note: string): void
    (e: 'move', to: OrderStatus): void
    (e: 'cancel'): void
    (e: 'payOpen'): void
    (e: 'refundOpen'): void
    (e: 'cancelTxn', t: Transaction): void
    (e: 'bannerClose'): void
    (e: 'edit'): void
}>()

const paymentLabel: Record<string, string> = {
    unpaid: 'Не оплачен', partial: 'Частично', paid: 'Оплачен',
    overpaid: 'Переплата', refunded: 'Возвращён',
}
const paymentPill: Record<string, string> = {
    unpaid: 'bg-tomato-500/15 text-tomato-500',
    partial: 'bg-saffron-300/40 text-ink-900',
    paid: 'bg-olive-500/15 text-olive-500',
    overpaid: 'bg-saffron-300/40 text-ink-900',
    refunded: 'bg-ink-100 text-ink-500',
}
function fmt(n: number) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(Number(n || 0))) + ' сум'
}
async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code) } catch { /* noop */ }
}
</script>

<template>
    <Drawer :visible="!!props.order" @update:visible="(v: boolean) => { if (!v) emit('close') }"
            position="right" :block-scroll="true"
            class="order-panel-drawer">
        <template #header>
            <div v-if="order" class="flex items-center gap-3 min-w-0 flex-1">
                <span class="font-display font-extrabold text-xl">{{ order.code }}</span>
                <button type="button" class="text-ink-400 hover:text-ink-900 p-1 -ml-2" title="Скопировать номер"
                        @click="copyCode(order.code)">
                    <i class="pi pi-copy text-xs"></i>
                </button>
                <span class="font-display font-extrabold text-lg text-ink-700">{{ fmt(Number(order.total)) }}</span>
                <span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                      :class="paymentPill[order.paymentStatus || 'unpaid']">
                    {{ paymentLabel[order.paymentStatus || 'unpaid'] }}
                </span>
            </div>
        </template>

        <OrderDetails :order="order" :events="events" :transactions="transactions" :panel-banner="panelBanner"
                      layout="panel"
                      @take="emit('take')" @confirm="(n: string) => emit('confirm', n)"
                      @move="(to: OrderStatus) => emit('move', to)" @cancel="emit('cancel')"
                      @pay-open="emit('payOpen')" @refund-open="emit('refundOpen')"
                      @cancel-txn="(t: Transaction) => emit('cancelTxn', t)"
                      @banner-close="emit('bannerClose')" @edit="emit('edit')" />
    </Drawer>
</template>

<style>
.p-drawer.order-panel-drawer {
    width: 100% !important;
}
@media (min-width: 1024px) {
    .p-drawer.order-panel-drawer { width: 760px !important; }
}
@media (min-width: 1280px) {
    .p-drawer.order-panel-drawer { width: 880px !important; }
}
</style>
