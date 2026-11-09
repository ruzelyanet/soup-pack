<!-- Зеркало client/src/components/ProductCard.vue (упрощённое, read-only превью).
     При изменении клиентского компонента — обновить. -->
<script setup lang="ts">
import './preview-tokens.css'
defineProps<{
    product: {
        id: number
        name: string
        image?: string | null
        tags?: string[] | null
        basePrice: number
        finalPrice: number
        discountPercent: number
        label?: string | null
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
    <article class="cp-card" style="min-height: 230px;">
        <div class="cp-tint-tom" style="position: relative; height: 150px; display: flex; align-items: center; justify-content: center;">
            <span v-if="product.tags?.includes('хит')" class="cp-badge-dark"
                  style="position: absolute; top: 10px; left: 10px; z-index: 10;">ХИТ</span>
            <div v-if="product.discountPercent > 0 && product.endsAt"
                 style="position: absolute; left: 8px; right: 8px; bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--color-acc); color: #fff; border-radius: 12px; padding: 4px 8px; z-index: 10; font-size: 11px;">
                <span style="font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;">
                    −{{ product.discountPercent }}%
                </span>
                <span style="width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.6);"></span>
                <span style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    до {{ fmtDate(product.endsAt) }}
                </span>
            </div>
            <img v-if="product.image" :src="product.image" :alt="product.name"
                 style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;" />
            <div v-else style="color: var(--color-fnt); font-size: 48px;">🍲</div>
        </div>
        <div style="padding: 12px; display: flex; flex-direction: column; gap: 4px; flex: 1;">
            <h3 style="margin: 0; font-weight: 800; font-size: 15px; line-height: 1.2;">{{ product.name }}</h3>
            <div style="margin-top: auto; padding-top: 8px; display: flex; align-items: end; justify-content: space-between;">
                <div style="display: flex; flex-direction: column;">
                    <span v-if="product.discountPercent > 0" class="cp-strike">{{ fmt(product.basePrice) }}</span>
                    <span class="cp-price" :class="{ 'cp-price-acc': product.discountPercent > 0 }">
                        {{ fmt(product.finalPrice) }}
                    </span>
                </div>
            </div>
        </div>
    </article>
</template>
