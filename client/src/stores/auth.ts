import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Client, Order } from '@/types'
import { api } from '@/services/api'

const STORAGE_CLIENT = 'souppack.client.v1'
const STORAGE_ORDERS = 'souppack.orders.v1'

function read<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}

/** Привести к +998XXXXXXXXX. */
function normalizePhone(input: string): string {
    const digits = input.replace(/\D/g, '').slice(-9)
    return '+998' + digits
}

/** Маппер Strapi-заказа в локальный Order. */
function mapOrder(o: any): Order {
    return {
        code: o.code,
        client: {
            fullName: o.client?.fullName || '',
            phone: o.client?.phone || '',
            address: o.client?.address,
            lat: o.client?.lat,
            lng: o.client?.lng,
        },
        items: (o.items || []).map((i: any) => ({
            productId: i.product?.id ?? 0,
            name: i.name,
            price: Number(i.price),
            qty: i.qty,
            basePrice:           i.basePrice           != null ? Number(i.basePrice)           : undefined,
            unitPrice:           i.unitPrice           != null ? Number(i.unitPrice)           : undefined,
            orderDiscountAmount: i.orderDiscountAmount != null ? Number(i.orderDiscountAmount) : undefined,
            lineTotal:           i.lineTotal           != null ? Number(i.lineTotal)           : undefined,
            orderSetId:          i.orderSetId          != null ? Number(i.orderSetId)          : undefined,
            setInstance:         i.setInstance ?? undefined,
            fromSetName:         i.fromSetName ?? undefined,
            discounts:           Array.isArray(i.discounts) ? i.discounts : undefined,
        })),
        comment: o.comment,
        paymentMethod: o.paymentMethod === 'cash' ? 'cash' : 'card',
        total: Number(o.total),
        discountTotal: o.discountTotal != null ? Number(o.discountTotal) : undefined,
        status: o.status,
        cancelReason: o.cancelReason,
        createdAt: o.createdAt,
    }
}

export const useAuth = defineStore('auth', () => {
    const client = ref<Client | null>(read<Client | null>(STORAGE_CLIENT, null))
    const myOrders = ref<Order[]>(read<Order[]>(STORAGE_ORDERS, []))
    const loading = ref(false)
    const error = ref<string | null>(null)

    const isAuthed = computed(() => !!client.value?.phone)

    function identify(c: Client) {
        client.value = c
    }

    function logout() {
        client.value = null
        myOrders.value = []
    }

    function pushOrder(o: Order) {
        myOrders.value = [o, ...myOrders.value]
    }

    /** Войти по номеру телефона: upsert на бэке + подгружаем заказы. */
    async function signInByPhone(rawPhone: string) {
        const phone = normalizePhone(rawPhone)
        loading.value = true
        error.value = null
        try {
            // Custom endpoint: находит или создаёт клиента, возвращает его данные.
            const res = await api.post('/clients/sign-in', { phone })
            const c = res.data?.data
            if (c) {
                client.value = {
                    fullName: c.fullName || '',
                    phone: c.phone || phone,
                    address: c.address || undefined,
                    lat: c.lat != null ? Number(c.lat) : undefined,
                    lng: c.lng != null ? Number(c.lng) : undefined,
                }
            } else {
                client.value = { fullName: '', phone }
            }
            await refreshOrders()
        } catch (e: any) {
            error.value = e?.message || 'Не удалось войти'
            throw e
        } finally {
            loading.value = false
        }
    }

    /** Обновить профиль (имя/адрес) на бэке и локально. */
    async function updateProfile(patch: {
        fullName?: string
        address?: string | null
        lat?: number | null
        lng?: number | null
    }) {
        if (!client.value?.phone) return
        loading.value = true
        error.value = null
        try {
            const res = await api.post('/clients/update-me', { phone: client.value.phone, ...patch })
            const c = res.data?.data
            if (c) {
                client.value = {
                    fullName: c.fullName || '',
                    phone: c.phone,
                    address: c.address || undefined,
                    lat: c.lat != null ? Number(c.lat) : undefined,
                    lng: c.lng != null ? Number(c.lng) : undefined,
                }
            }
        } catch (e: any) {
            error.value = e?.message || 'Не удалось сохранить профиль'
            throw e
        } finally {
            loading.value = false
        }
    }

    /** После оформления заказа фиксируем «последний использованный» адрес у клиента локально. */
    function rememberLastAddress(address?: string, lat?: number, lng?: number) {
        if (!client.value) return
        client.value = {
            ...client.value,
            address: address ?? client.value.address,
            lat: lat ?? client.value.lat,
            lng: lng ?? client.value.lng,
        }
    }

    /** Перезабрать заказы текущего клиента с бэка (публичный эндпоинт /orders/mine). */
    async function refreshOrders() {
        if (!client.value?.phone) return
        try {
            const res = await api.post('/orders/mine', { phone: client.value.phone })
            const rows = (res.data?.data ?? []) as any[]
            if (rows.length) {
                myOrders.value = rows.map(mapOrder)
            }
        } catch {
            /* ignore — остаёмся на локальной истории */
        }
    }

    watch(client, (v) => localStorage.setItem(STORAGE_CLIENT, JSON.stringify(v)))
    watch(myOrders, (v) => localStorage.setItem(STORAGE_ORDERS, JSON.stringify(v)), { deep: true })

    return {
        client, myOrders, loading, error,
        isAuthed, identify, logout, pushOrder,
        signInByPhone, refreshOrders, updateProfile, rememberLastAddress,
    }
})
