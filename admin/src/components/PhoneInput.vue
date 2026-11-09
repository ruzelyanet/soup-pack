<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
    modelValue: string
    id?: string
    placeholder?: string
    autofocus?: boolean
    inputClass?: string
}>()
const emit = defineEmits<{
    (e: 'update:modelValue', v: string): void
}>()

/** Вернуть только 9 цифр после +998 из любой строки. */
function toLocalDigits(raw: string): string {
    const d = raw.replace(/\D/g, '')
    if (d.startsWith('998')) return d.slice(3, 12)
    if (d.length >= 12 && d.startsWith('98')) return d.slice(2, 11)
    return d.slice(0, 9)
}

/** Собрать отформатированный `+998 XX XXX XX XX` из 9 цифр. */
function format(digits: string): string {
    const d = digits.slice(0, 9)
    if (!d) return '+998 '
    const parts: string[] = []
    if (d.length >= 1) parts.push(d.slice(0, 2))
    if (d.length >= 3) parts.push(d.slice(2, 5))
    if (d.length >= 6) parts.push(d.slice(5, 7))
    if (d.length >= 8) parts.push(d.slice(7, 9))
    return '+998 ' + parts.join(' ')
}

const display = computed(() => format(toLocalDigits(props.modelValue || '')))

function onInput(ev: Event) {
    const target = ev.target as HTMLInputElement
    const digits = toLocalDigits(target.value)
    const formatted = format(digits)
    emit('update:modelValue', formatted)
    if (target.value !== formatted) target.value = formatted
    const caret = formatted.length
    requestAnimationFrame(() => target.setSelectionRange(caret, caret))
}

function onFocus(ev: FocusEvent) {
    const target = ev.target as HTMLInputElement
    if (!props.modelValue || target.value === '+998 ') {
        emit('update:modelValue', '+998 ')
    }
    const caret = target.value.length
    requestAnimationFrame(() => target.setSelectionRange(caret, caret))
}

function onKeyDown(ev: KeyboardEvent) {
    const target = ev.target as HTMLInputElement
    if (ev.key === 'Backspace' && target.selectionStart !== null && target.selectionStart <= 5) {
        ev.preventDefault()
    }
}
</script>

<template>
    <input
        :id="id"
        type="tel"
        inputmode="tel"
        autocomplete="tel"
        :value="display"
        :placeholder="placeholder || '+998 __ ___ __ __'"
        :autofocus="autofocus"
        :class="inputClass"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeyDown"
    />
</template>
