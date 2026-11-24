import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

const STORAGE_KEY = 'souppack.checkout.v1'

export type PayMethod = 'cash' | 'card' | 'click' | 'payme' | 'transfer'
export type DeliveryMethod = 'courier_now' | 'preorder'

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
    preorderDate: Date | null
    preorderTime: string
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
        preorderDate: null,
        preorderTime: '12:00',
        pay: 'card',
    }
}

/** Прочитать форму из localStorage. Date десериализуем из ISO. */
function readStorage(): CheckoutForm {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return defaults()
        const parsed = JSON.parse(raw) as Partial<CheckoutForm> & { preorderDate?: string | null }
        const d = defaults()
        return {
            ...d,
            ...parsed,
            preorderDate: parsed.preorderDate ? new Date(parsed.preorderDate as any) : null,
        }
    } catch {
        return defaults()
    }
}

export const useCheckout = defineStore('checkout', () => {
    const form = reactive<CheckoutForm>(readStorage())

    function reset() {
        Object.assign(form, defaults())
    }

    watch(
        form,
        (v) => {
            try {
                // Date сериализуется через toJSON как ISO — ок.
                localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
            } catch { /* storage disabled */ }
        },
        { deep: true },
    )

    return { form, reset }
})
