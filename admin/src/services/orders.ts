import { api } from './api'
import type { Order, OrderPreview } from './resources'

export type OrderPayload = {
    client: {
        fullName?: string
        phone: string
        address?: string | null
        lat?: number | null
        lng?: number | null
    }
    items: Array<{
        /** Новый формат: `{type:'product', productId, qty}` или `{type:'set', orderSetId, qty}`. */
        type?: 'product' | 'set'
        orderSetId?: number | null
        productId?: number | null
        name?: string
        price?: number
        qty: number
        setDiscountPercent?: number | null
        fromSetName?: string | null
    }>
    paymentMethod?: 'cash' | 'card' | 'click' | 'payme' | 'transfer'
    deliveryMethod?: 'courier_now' | 'preorder'
    deliverySlotAt?: string | null
    comment?: string | null
    address?: string | null
    lat?: number | null
    lng?: number | null
}

export const StaffOrders = {
    async preview(payload: OrderPayload): Promise<OrderPreview> {
        const res = await api.post('/staff/orders/preview', payload)
        return res.data?.data as OrderPreview
    },
    async createManual(payload: OrderPayload): Promise<Order> {
        const res = await api.post('/staff/orders', payload)
        return res.data?.data as Order
    },
    async convert(requestId: number, payload: OrderPayload): Promise<Order> {
        const res = await api.post(`/staff/requests/${requestId}/convert`, payload)
        return res.data?.data as Order
    },
    /** Правка заказа (только пока `status = new`). Сервер пересчитывает цены и скидки. */
    async edit(orderId: number, payload: OrderPayload): Promise<Order> {
        const res = await api.put(`/staff/orders/${orderId}/edit`, payload)
        return res.data?.data as Order
    },
    /** Отмена заказа: причина обязательна, все транзакции заказа сторнируются. */
    async cancel(orderId: number, reason: string): Promise<Order> {
        const res = await api.post(`/staff/orders/${orderId}/cancel`, { reason })
        return res.data?.data as Order
    },
}

/** Человеческие сообщения для кодов ошибок заказа. */
export function orderErrorText(code: string | undefined | null): string | null {
    switch (code) {
        case 'ORDER_LOCKED':           return 'Заказ уже подтверждён клиентом — менять его нельзя'
        case 'ORDER_CANCELED':         return 'Заказ отменён'
        case 'ALREADY_CANCELED':       return 'Заказ уже отменён'
        case 'ORDER_DONE':             return 'Завершённый заказ нельзя отменить'
        case 'ORDER_NOT_PAID':         return 'Заказ не оплачен полностью — сначала примите оплату'
        case 'CANCEL_REASON_REQUIRED': return 'Укажите причину отмены'
        case 'CANCEL_REASON_TOO_LONG': return 'Причина слишком длинная (до 250 символов)'
        case 'USE_EDIT_ENDPOINT':      return 'Состав и суммы меняются только через редактирование заказа'
        default:                       return null
    }
}
