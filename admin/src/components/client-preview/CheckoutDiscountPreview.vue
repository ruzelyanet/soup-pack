<!-- Зеркало блока скидки на чекауте: подсказка «добавьте ещё» (ниже порога) + бейдж «Ваша скидка −N%» (выше). -->
<script setup lang="ts">
import './preview-tokens.css'
defineProps<{
    below?: {
        subtotal: number
        hint?: { missing: number; label: string } | null
    } | null
    above?: {
        subtotal: number
        discountTotal: number
        total: number
        percent?: number | null
    } | null
}>()
function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(v) + ' сум' }
</script>

<template>
    <div style="display: flex; flex-direction: column; gap: 16px;">
        <div v-if="below" class="cp-card" style="padding: 16px;">
            <div style="font-weight: 800; font-size: 13px; color: var(--color-fnt); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">
                Корзина без скидки
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 14px;">
                <span>Сумма заказа</span>
                <span style="font-weight: 700;">{{ fmt(below.subtotal) }}</span>
            </div>
            <div v-if="below.hint" style="margin-top: 12px; background: var(--color-sf2); border-radius: 14px; padding: 10px 12px; font-size: 13px; color: var(--color-ink);">
                <b>+{{ fmt(below.hint.missing) }}</b> — и получите «{{ below.hint.label }}»
            </div>
        </div>
        <div v-if="above" class="cp-card" style="padding: 16px;">
            <div style="font-weight: 800; font-size: 13px; color: var(--color-fnt); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">
                Корзина со скидкой
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 14px;">
                <span>Сумма заказа</span>
                <span>{{ fmt(above.subtotal) }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 14px; color: var(--color-acct);">
                <span>Ваша скидка<span v-if="above.percent"> −{{ above.percent }}%</span></span>
                <span>− {{ fmt(above.discountTotal) }}</span>
            </div>
            <div style="margin-top: 6px; display: flex; justify-content: space-between; font-weight: 900; font-size: 18px;">
                <span>Итого</span>
                <span>{{ fmt(above.total) }}</span>
            </div>
        </div>
    </div>
</template>
