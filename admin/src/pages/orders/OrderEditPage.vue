<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import OrderCreateForm from './components/OrderCreateForm.vue'
import { Orders, type Order } from '@/services/resources'
import { STATUS_LABEL } from '@/utils/orderFlow'

/** Редактирование заказа — та же форма, что и создание. Доступно, пока клиент не подтвердил заказ. */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const orderId = computed(() => Number(route.params.id))
const order = ref<Order | null>(null)
const loading = ref(true)

onMounted(async () => {
    try {
        const rows = await Orders.list({
            filters: { id: { $eq: orderId.value } },
            populate: { items: { populate: ['product'] }, client: true },
        })
        order.value = rows[0] ?? null
    } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Не удалось загрузить заказ', detail: e?.message, life: 3000 })
    } finally {
        loading.value = false
    }
})

const locked = computed(() => !!order.value && order.value.status !== 'new')

function backToOrder() { router.push({ name: 'order', params: { id: orderId.value } }) }
function onSaved(o: Order) { router.push({ name: 'order', params: { id: o?.id ?? orderId.value } }) }
</script>

<template>
    <div v-if="loading" class="p-8">
        <div class="h-[70vh] rounded-2xl bg-white ring-1 ring-ink-100 animate-pulse"></div>
    </div>
    <div v-else-if="!order || locked" class="max-w-md mx-auto mt-20 px-6 text-center space-y-3">
        <i class="pi pi-lock text-3xl text-ink-300"></i>
        <div class="font-display font-bold text-xl">
            {{ !order ? 'Заказ не найден' : 'Заказ больше нельзя редактировать' }}
        </div>
        <p v-if="order" class="text-sm text-ink-500">
            Статус «{{ STATUS_LABEL[order.status] }}». Состав и данные можно менять только до подтверждения клиентом.
        </p>
        <button type="button" class="h-11 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold" @click="order ? backToOrder() : router.push('/orders')">
            {{ order ? 'К заказу' : 'К списку заказов' }}
        </button>
    </div>
    <OrderCreateForm v-else :order="order" @cancel="backToOrder" @created="onSaved" />
</template>
