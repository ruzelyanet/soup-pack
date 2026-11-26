<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
    endsAt: string | null | undefined
    /** 'compact' — чипс «3д 14ч», 'full' — крупные плашки с анимацией. */
    variant?: 'compact' | 'full'
}>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
    now.value = Date.now()
    const interval = props.variant === 'full' ? 1000 : 60_000
    timer = setInterval(() => { now.value = Date.now() }, interval)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const remaining = computed(() => {
    if (!props.endsAt) return null
    const end = new Date(props.endsAt).getTime()
    if (!end) return null
    const diff = Math.max(0, end - now.value)
    return {
        total: diff,
        days: Math.floor(diff / 86_400_000),
        hours: Math.floor((diff / 3_600_000) % 24),
        minutes: Math.floor((diff / 60_000) % 60),
        seconds: Math.floor((diff / 1_000) % 60),
        expired: diff <= 0,
    }
})

function pad(n: number) { return String(n).padStart(2, '0') }

const compactText = computed(() => {
    const r = remaining.value
    if (!r) return ''
    if (r.expired) return 'Завершено'
    if (r.days > 0) return `${r.days}д ${r.hours}ч`
    if (r.hours > 0) return `${r.hours}ч ${r.minutes}м`
    return `${r.minutes}м`
})

/** Пульс на блок секунд — чтобы было видно, что оно живое. */
const tick = ref(false)
watch(() => remaining.value?.seconds, () => {
    if (props.variant !== 'full') return
    tick.value = true
    requestAnimationFrame(() => { tick.value = false })
})
</script>

<template>
    <template v-if="remaining">
        <!-- Compact: однострочный чип -->
        <span v-if="(variant || 'compact') === 'compact'"
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider"
              :class="remaining.expired
                  ? 'bg-ink/5 text-fnt'
                  : remaining.days < 1 ? 'bg-acc/15 text-acc' : 'bg-saffron-300/40 text-ink'">
            <span class="pi pi-clock text-[10px]"></span>
            {{ compactText }}
        </span>

        <!-- Full: крупные плашки с разделителями и пульсом секунд -->
        <div v-else class="flex items-stretch gap-2 text-white">
            <div v-for="(b, idx) in [
                { n: remaining.days, l: 'дней', key: 'd' },
                { n: remaining.hours, l: 'часов', key: 'h' },
                { n: remaining.minutes, l: 'минут', key: 'm' },
                { n: remaining.seconds, l: 'секунд', key: 's' },
            ]" :key="b.key"
                 class="relative flex-1 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/20 px-2 py-3 text-center overflow-hidden"
                 :class="b.key === 's' && tick ? 'ring-white/60' : ''">
                <div class="font-display font-black text-[36px] leading-none tabular-nums text-white drop-shadow-sm"
                     :class="b.key === 's' ? 'transition-transform duration-300' : ''"
                     :style="b.key === 's' && tick ? 'transform: scale(1.08)' : ''">
                    {{ pad(b.n) }}
                </div>
                <div class="text-[10px] font-bold uppercase tracking-wider text-white/70 mt-1.5">
                    {{ b.l }}
                </div>
                <!-- Разделитель «:» между блоками -->
                <span v-if="idx < 3"
                      class="absolute -right-1.5 top-1/2 -translate-y-1/2 font-display font-black text-[22px] text-white/40 leading-none pointer-events-none">:</span>
            </div>
        </div>
    </template>
</template>
