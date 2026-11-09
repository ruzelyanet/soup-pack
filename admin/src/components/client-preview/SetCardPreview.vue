<!-- Зеркало карточки набора на клиенте. -->
<script setup lang="ts">
import './preview-tokens.css'
defineProps<{
    set: {
        name: string
        banner?: string | null
        basePrice: number
        finalPrice: number
        discountPercent: number
        endsAt?: string | null
    }
}>()
function fmt(v: number) { return new Intl.NumberFormat('ru-RU').format(v) + ' сум' }
function fmtDate(d?: string | null) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
    <article class="cp-card">
        <div class="cp-tint-pum" style="position: relative; height: 160px; display: flex; align-items: center; justify-content: center;">
            <img v-if="set.banner" :src="set.banner" :alt="set.name"
                 style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;" />
            <div v-else style="font-size: 60px;">🍲</div>
            <span style="position: absolute; top: 10px; left: 10px;" class="cp-badge-dark">Набор</span>
            <span v-if="set.discountPercent > 0" style="position: absolute; top: 10px; right: 10px; background: var(--color-acc); color: #fff; font-weight: 800; font-size: 12px; padding: 4px 10px; border-radius: 999px;">
                −{{ set.discountPercent }}%
            </span>
        </div>
        <div style="padding: 14px; display: flex; flex-direction: column; gap: 4px;">
            <h3 style="margin: 0; font-weight: 800; font-size: 16px;">{{ set.name }}</h3>
            <div style="margin-top: 6px; display: flex; align-items: end; justify-content: space-between;">
                <div style="display: flex; flex-direction: column;">
                    <span v-if="set.discountPercent > 0" class="cp-strike">{{ fmt(set.basePrice) }}</span>
                    <span class="cp-price" :class="{ 'cp-price-acc': set.discountPercent > 0 }" style="font-size: 18px;">
                        {{ fmt(set.finalPrice) }}
                    </span>
                </div>
                <div v-if="set.endsAt" style="font-size: 11px; color: var(--color-fnt); font-weight: 600; text-align: right; line-height: 1.1;">
                    до<br>{{ fmtDate(set.endsAt) }}
                </div>
            </div>
        </div>
    </article>
</template>
