<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'

const props = withDefaults(
    defineProps<{
        loading?: boolean
        formData: Record<string, any>
        reactiveFields?: string[]
        staticFields?: string[]
    }>(),
    { loading: false, reactiveFields: () => [], staticFields: () => [] },
)
const emit = defineEmits<{
    (e: 'submit'): void
    (e: 'toggleFilter', v: boolean): void
    (e: 'clearStaticFields'): void
}>()

const isOpened = ref(props.staticFields.some((k) => props.formData[k] != null && props.formData[k] !== '' && props.formData[k] !== 'all'))

function toggleFilter() {
    isOpened.value = !isOpened.value
    emit('toggleFilter', isOpened.value)
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let t: number | null = null
    return ((...args: any[]) => {
        if (t != null) clearTimeout(t)
        t = window.setTimeout(() => fn(...args), ms)
    }) as T
}

function submitFilter() { emit('submit') }
const handleSearch = debounce(submitFilter, 700)

for (const key of props.reactiveFields) {
    watch(() => props.formData[key], () => handleSearch())
}

function clearStaticFields() { emit('clearStaticFields') }

defineExpose({ submitFilter })
</script>

<template>
    <form @submit.prevent="submitFilter">
        <div class="lg:flex gap-2">
            <div class="w-full mb-2 lg:mb-0">
                <slot name="reactive-fields" />
            </div>
            <div v-if="staticFields.length" class="shrink-0">
                <Button severity="secondary" @click="toggleFilter"
                        class="!bg-ink-100 !border-ink-100 w-full">
                    <span class="flex items-center gap-2">
                        <span class="pi" :class="isOpened ? 'pi-chevron-up' : 'pi-chevron-down'"></span>
                        <span class="pi pi-filter text-primary-500"></span>
                        <span>Фильтр</span>
                    </span>
                </Button>
            </div>
        </div>

        <div v-if="isOpened" class="rounded-lg border border-ink-100 p-4 mt-2">
            <div class="mb-3">
                <slot name="static-fields" />
            </div>

            <div class="flex justify-center gap-2">
                <Button severity="secondary" icon="pi pi-refresh" label="Сбросить"
                        class="block" @click="clearStaticFields" />
                <Button label="Применить" icon="pi pi-search" class="block" type="submit" />
            </div>
        </div>
    </form>
</template>
