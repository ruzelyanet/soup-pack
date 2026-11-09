<script setup lang="ts">
import Dialog from 'primevue/dialog'
import OrderCreateForm, { type Prefill } from './OrderCreateForm.vue'
import type { Order } from '@/services/resources'

defineProps<{
    visible: boolean
    prefill?: Prefill | null
}>()

const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'created', order: Order): void
}>()
</script>

<template>
    <Dialog :visible="visible" @update:visible="(v: boolean) => emit('update:visible', v)"
            modal :draggable="false" :show-header="false"
            :style="{ width: 'min(1400px, 96vw)', height: 'min(920px, 94vh)' }"
            :pt="{ root: { class: '!rounded-2xl overflow-hidden !border-0' }, content: { class: '!p-0 h-full' } }">
        <OrderCreateForm v-if="visible"
                         :prefill="prefill"
                         @cancel="emit('update:visible', false)"
                         @created="(o: Order) => { emit('created', o); emit('update:visible', false) }" />
    </Dialog>
</template>
