<!-- Зеркало клиентской страницы «Скидки» (одна плитка). -->
<script setup lang="ts">
import './preview-tokens.css'
defineProps<{
    item: {
        kind: 'product' | 'set'
        name: string
        description?: string | null
        image?: string | null
        basePrice: number
        finalPrice: number
        discountPercent: number
        endsAt?: string | null
        tags?: string[] | null
    }
}>()
function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(v) + ' сум' }
function fmtDate(d?: string | null) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
    <div class="cp-card" style="flex-direction: row; min-height: 128px;">
        <div class="cp-tint-tom" style="flex-shrink: 0; width: 128px; height: 128px; position: relative; display: flex; align-items: center; justify-content: center;">
            <img v-if="item.image" :src="item.image" :alt="item.name"
                 style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;" />
            <div v-else style="font-size: 48px;">🍲</div>
            <span style="position: absolute; top: 8px; left: 8px; background: var(--color-acc); color: #fff; font-weight: 800; font-size: 12px; letter-spacing: 0.04em; padding: 4px 10px; border-radius: 999px;">
                −{{ item.discountPercent }}%
            </span>
        </div>
        <div style="flex: 1; min-width: 0; padding: 12px 12px 12px 12px; display: flex; flex-direction: column; gap: 6px;">
            <span v-if="item.kind === 'set'" class="cp-badge-dark" style="align-self: flex-start;">Набор</span>
            <h3 style="margin: 0; font-weight: 800; font-size: 16px; line-height: 1.2;">{{ item.name }}</h3>
            <p v-if="item.description" style="margin: 0; font-size: 12px; color: var(--color-fnt); line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                {{ item.description }}
            </p>
            <div style="margin-top: auto; display: flex; align-items: end; justify-content: space-between; gap: 8px;">
                <div style="display: flex; flex-direction: column;">
                    <span class="cp-strike" style="line-height: 1;">{{ fmt(item.basePrice) }}</span>
                    <span style="font-weight: 900; font-size: 18px; line-height: 1.1; color: var(--color-acct);">
                        {{ fmt(item.finalPrice) }}
                    </span>
                </div>
                <div v-if="item.endsAt" style="text-align: right; font-size: 11px; color: var(--color-fnt); font-weight: 600; line-height: 1.1;">
                    до<br>{{ fmtDate(item.endsAt) }}
                </div>
            </div>
        </div>
    </div>
</template>
