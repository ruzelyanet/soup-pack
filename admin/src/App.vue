<script setup lang="ts">
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import RequestToast from '@/components/RequestToast.vue'
import OrderToast from '@/components/OrderToast.vue'
import { useTitleBadge } from '@/composables/useTitleBadge'

useTitleBadge()
</script>

<template>
    <RouterView />
    <Toast position="top-right" />
    <RequestToast />
    <OrderToast />
    <ConfirmDialog />
</template>
