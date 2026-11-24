import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

const STORAGE_KEY = 'souppack.checkout.v1'

export type PayMethod = 'cash' | 'card' | 'click' | 'payme' | 'transfer'
export type DeliveryMethod = 'courier_now'

export interface CheckoutForm {
    /** Локально отформатированный номер без «+998», как в инпуте (`90 000 00 00`). */
    phone: string
    fullName: string
    address: string
    lat?: number
    lng?: number
    flat: string
    entrance: string
    floor: string
    comment: string
    delivery: DeliveryMethod
    deliveryMethodCode: string
    pay: PayMethod
}

function defaults(): CheckoutForm {
    return {
        phone: '',
        fullName: '',
        address: '',
        lat: undefined,
        lng: undefined,
        flat: '',
        entrance: '',
        floor: '',
        comment: '',
        delivery: 'courier_now',
        deliveryMethodCode: 'courier_now',
        pay: 'cash',
    }
}

function readStorage(): CheckoutForm {
    if (!import.meta.client) return defaults()
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return defaults()
        const parsed = JSON.parse(raw) as Partial<CheckoutForm>
        return { ...defaults(), ...parsed, delivery: 'courier_now' }
    } catch {
        return defaults()
    }
}

export const useCheckout = defineStore('checkout', () => {
    const form = reactive<CheckoutForm>(readStorage())

    function reset() {
        Object.assign(form, defaults())
    }

    if (import.meta.client) {
        watch(
            form,
            (v) => {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
                } catch { /* storage disabled */ }
            },
            { deep: true },
        )
    }

    return { form, reset }
})
