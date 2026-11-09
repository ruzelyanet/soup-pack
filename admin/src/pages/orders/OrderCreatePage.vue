<script setup lang="ts">
import { useRouter } from 'vue-router'
import OrderCreateForm from './components/OrderCreateForm.vue'
import type { Order } from '@/services/resources'

const router = useRouter()

function onCancel()                { router.push('/orders') }
/** После создания — сразу на страницу заказа. */
function onCreated(o: Order)       { router.push(o?.id ? { name: 'order', params: { id: o.id } } : '/orders') }
</script>

<template>
    <OrderCreateForm @cancel="onCancel" @created="onCreated" />
</template>
