<script setup lang="ts">
import { computed, ref } from 'vue'
import OverlayPanel from 'primevue/overlaypanel'
import DatePicker from 'primevue/datepicker'

/** Пресет периода. `null` = «Всё время». */
export type PeriodKey = 'null' | 'year' | 'this-year' | 'month' | 'this-month'
    | 'week' | 'this-week' | 'today' | 'yesterday' | 'other'

const props = withDefaults(
    defineProps<{
        /** Диапазон [from, to] или null. */
        modelValue?: [Date | null, Date | null] | null
        /** Какие пресеты показывать и в каком порядке. */
        periods?: PeriodKey[]
    }>(),
    {
        modelValue: null,
        periods: () => ['null', 'year', 'month', 'week', 'other'],
    },
)
const emit = defineEmits<{
    (e: 'update:modelValue', v: [Date, Date] | null): void
}>()

const LABELS: Record<Exclude<PeriodKey, 'other'>, string> = {
    'null':       'Все',
    'year':       '12 мес',
    'this-year':  'Этот год',
    'month':      '30 дней',
    'this-month': 'Этот месяц',
    'week':       '7 дней',
    'this-week':  'Эта неделя',
    'today':      'Сегодня',
    'yesterday':  'Вчера',
}

/** Вычислить [from, to] под пресет. */
function rangeOf(key: PeriodKey): [Date, Date] | null {
    const now = new Date()
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)

    const start = new Date(now)
    start.setHours(0, 0, 0, 0)

    switch (key) {
        case 'null': return null
        case 'today':
            return [start, end]
        case 'yesterday': {
            const s = new Date(start); s.setDate(s.getDate() - 1)
            const e = new Date(end);   e.setDate(e.getDate() - 1)
            return [s, e]
        }
        case 'week': {
            const s = new Date(start); s.setDate(s.getDate() - 6)
            return [s, end]
        }
        case 'this-week': {
            const d = new Date(start)
            const dow = (d.getDay() + 6) % 7 // пн=0
            d.setDate(d.getDate() - dow)
            return [d, end]
        }
        case 'month': {
            const s = new Date(start); s.setDate(s.getDate() - 29)
            return [s, end]
        }
        case 'this-month': {
            const d = new Date(start); d.setDate(1)
            return [d, end]
        }
        case 'year': {
            const s = new Date(start); s.setFullYear(s.getFullYear() - 1)
            return [s, end]
        }
        case 'this-year': {
            return [new Date(now.getFullYear(), 0, 1), end]
        }
        default: return null
    }
}

/** Сравнение двух диапазонов на равенство (с точностью до дня). */
function sameRange(a: [Date | null, Date | null] | null, b: [Date, Date] | null) {
    if (!a && !b) return true
    if (!a || !b) return false
    return a[0]?.toDateString() === b[0].toDateString()
        && a[1]?.toDateString() === b[1].toDateString()
}

/** Для каждого пресета знаем диапазон → сравниваем с текущим modelValue. */
const activeKey = computed<PeriodKey | null>(() => {
    for (const k of props.periods) {
        if (k === 'other') continue
        if (sameRange(props.modelValue, rangeOf(k))) return k
    }
    return null
})

function pick(key: PeriodKey) {
    emit('update:modelValue', rangeOf(key))
}

/** Диапазон в заголовке «кастомного» диапазона. */
function fmtDate(d: Date | null | undefined) {
    if (!d) return '—'
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const op = ref<InstanceType<typeof OverlayPanel> | null>(null)
const customRange = ref<Date[] | null>(null)

function openCalendar(e: Event) {
    customRange.value = props.modelValue
        ? [props.modelValue[0] as Date, props.modelValue[1] as Date].filter(Boolean) as Date[]
        : null
    op.value?.toggle(e)
}

function onCustomChange(val: Date[] | null) {
    if (val && val.length === 2 && val[0] && val[1]) {
        const [s, e] = val
        const start = new Date(s); start.setHours(0, 0, 0, 0)
        const end   = new Date(e); end.setHours(23, 59, 59, 999)
        emit('update:modelValue', [start, end])
        op.value?.hide()
    }
}

function clearCustom() {
    emit('update:modelValue', null)
}
</script>

<template>
    <div class="inline-flex">
        <div class="p-1 flex rounded-l-[8px] gap-1 bg-white border border-ink-200 border-r-0">
            <template v-if="activeKey">
                <div v-for="k in periods.filter((p) => p !== 'other')" :key="k"
                     @click="pick(k)"
                     class="flex justify-center items-center whitespace-nowrap text-[11px] rounded-[6px] leading-none px-3 py-2.5 cursor-pointer select-none transition"
                     :class="activeKey === k
                        ? 'bg-tomato-500 text-white font-bold'
                        : 'text-ink-700 hover:bg-ink-100 font-semibold'">
                    {{ LABELS[k as Exclude<PeriodKey, 'other'>] }}
                </div>
            </template>

            <template v-else>
                <!-- Кастомный диапазон активен — показываем «чип» со значениями + крестик -->
                <div class="flex">
                    <div class="whitespace-nowrap text-[11px] rounded-l-[6px] leading-none px-3 py-2.5 bg-tomato-500 text-white font-bold flex items-center">
                        {{ fmtDate(modelValue?.[0]) }} — {{ fmtDate(modelValue?.[1]) }}
                    </div>
                    <div class="text-[12px] rounded-r-[6px] leading-none inline-flex items-center px-2 bg-tomato-500/15 text-tomato-600 hover:bg-tomato-500/30 transition cursor-pointer"
                         @click="clearCustom">
                        <i class="pi pi-times"></i>
                    </div>
                </div>
            </template>
        </div>

        <div v-if="periods.includes('other')"
             @click="openCalendar"
             class="rounded-r-[8px] inline-flex items-center px-3 bg-tomato-500/15 text-tomato-600 hover:bg-tomato-500/30 border border-ink-200 border-l-0 transition cursor-pointer select-none">
            <i class="pi pi-calendar text-sm"></i>
        </div>

        <OverlayPanel ref="op">
            <DatePicker v-model="customRange"
                        inline selectionMode="range"
                        dateFormat="dd.mm.yy"
                        @update:modelValue="onCustomChange" />
        </OverlayPanel>
    </div>
</template>
