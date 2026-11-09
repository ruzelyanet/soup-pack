import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { api } from '@/services/api'
import type { OrderSet, Product } from '@/types'

const STORAGE_KEY = 'souppack.cart.v2'
const STORAGE_KEY_LEGACY = 'souppack.cart.v1'

/** Запись в корзине. Хранит только ссылку и количество — цена/скидки считаются на сервере. */
export interface CartItem {
    type: 'product' | 'set'
    refId: number        // productId или orderSetId
    qty: number
    name?: string        // display cache
    image?: string
}

/** Строка из серверного quote — то, что показываем в UI. */
export interface QuoteLineView {
    lineKey: string
    productId: number | null
    orderSetId: number | null
    setInstance: string | null
    name: string
    qty: number
    basePrice: number
    unitPrice: number
    orderDiscountAmount: number
    lineTotal: number
    discounts: Array<{
        discountId: number; version: number; name: string
        level: 'line' | 'set' | 'order'; benefitType: string; benefitValue: number; amount: number
    }>
}

export interface QuoteSnapshot {
    lines: QuoteLineView[]
    subtotal: number
    discountTotal: number
    total: number
    appliedDiscounts: Array<{ discountId: number; name: string; publicLabel?: string | null; amount: number }>
    hints: Array<{ code: 'NEXT_TIER'; discountId: number; missing: number; label: string }>
}

/** Миграция из старого формата (строки-в-наборе спред'ом) в новый. */
function migrateLegacy(): CartItem[] | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_LEGACY)
        if (!raw) return null
        const old = JSON.parse(raw) as any[]
        if (!Array.isArray(old)) return null
        const items: CartItem[] = []
        const setMarked = new Set<number>()
        for (const l of old) {
            if (l.orderSetId) {
                // Все строки одного `orderSetId` → одна позиция набора.
                if (!setMarked.has(l.orderSetId)) {
                    setMarked.add(l.orderSetId)
                    items.push({ type: 'set', refId: Number(l.orderSetId), qty: 1, name: l.fromSetName })
                }
            } else if (l.productId) {
                items.push({ type: 'product', refId: Number(l.productId), qty: Math.max(1, Math.floor(Number(l.qty) || 1)), name: l.name, image: l.image })
            }
        }
        return items
    } catch { return null }
}

function readStorage(): CartItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) return JSON.parse(raw) as CartItem[]
    } catch { /* ignore */ }
    // Пытаемся мигрировать старый v1.
    const migrated = migrateLegacy()
    if (migrated) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)) } catch { /* ignore */ }
        try { localStorage.removeItem(STORAGE_KEY_LEGACY) } catch { /* ignore */ }
        return migrated
    }
    return []
}

export const useCart = defineStore('cart', () => {
    const items = ref<CartItem[]>(readStorage())
    const quote = ref<QuoteSnapshot | null>(null)
    const quoting = ref(false)

    // Контекст — задаётся с чекаута (способ доставки/оплаты влияет на acc).
    const deliveryMethod = ref<string>('courier_now')
    const paymentMethod = ref<string>('card')

    const count = computed(() => items.value.reduce((s, i) => s + i.qty, 0))
    const subtotal = computed(() => quote.value?.subtotal ?? 0)
    const total = computed(() => quote.value?.total ?? 0)
    const discountTotal = computed(() => quote.value?.discountTotal ?? 0)
    const hints = computed(() => quote.value?.hints ?? [])
    const lines = computed<QuoteLineView[]>(() => quote.value?.lines ?? [])

    /** Количество этого товара в корзине (суммарно, включая строки из наборов). */
    function qtyOfProduct(productId: number): number {
        let n = 0
        for (const l of lines.value) if (l.productId === productId) n += l.qty
        return n
    }
    /** Есть ли этот товар как отдельная позиция (не в наборе) — для контролов «±» в карточке. */
    function standaloneQty(productId: number): number {
        const item = items.value.find((i) => i.type === 'product' && i.refId === productId)
        return item?.qty ?? 0
    }

    function addProduct(product: Product, qty = 1) {
        const img = typeof product.image === 'string' ? product.image : product.image?.url
        const existing = items.value.find((i) => i.type === 'product' && i.refId === product.id)
        if (existing) existing.qty += qty
        else items.value.push({ type: 'product', refId: product.id, qty, name: product.name, image: img })
        refetch()
    }

    function addSet(set: OrderSet, qty = 1) {
        const existing = items.value.find((i) => i.type === 'set' && i.refId === set.id)
        if (existing) existing.qty += qty
        else items.value.push({ type: 'set', refId: set.id, qty, name: set.name, image: set.banner })
        refetch()
    }

    function setProductQty(productId: number, qty: number) {
        const idx = items.value.findIndex((i) => i.type === 'product' && i.refId === productId)
        if (idx < 0) return
        if (qty <= 0) items.value.splice(idx, 1)
        else items.value[idx].qty = qty
        refetch()
    }

    function setQtyAt(idx: number, qty: number) {
        if (idx < 0 || idx >= items.value.length) return
        if (qty <= 0) items.value.splice(idx, 1)
        else items.value[idx].qty = qty
        refetch()
    }

    function removeAt(idx: number) {
        if (idx >= 0 && idx < items.value.length) items.value.splice(idx, 1)
        refetch()
    }

    function clear() {
        items.value = []
        quote.value = null
    }

    function setContext(opts: { deliveryMethod?: string; paymentMethod?: string }) {
        if (opts.deliveryMethod) deliveryMethod.value = opts.deliveryMethod
        if (opts.paymentMethod)  paymentMethod.value = opts.paymentMethod
        refetch()
    }

    // ───── Debounced quote fetch ─────
    let timer: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    async function refetch() {
        if (timer) { clearTimeout(timer); timer = null }
        if (!items.value.length) {
            quote.value = null
            return
        }
        const my = ++seq
        timer = setTimeout(async () => {
            quoting.value = true
            try {
                const payload = {
                    items: items.value.map((i) => i.type === 'set'
                        ? { type: 'set', orderSetId: i.refId, qty: i.qty }
                        : { type: 'product', productId: i.refId, qty: i.qty }),
                    deliveryMethod: deliveryMethod.value,
                    paymentMethod: paymentMethod.value,
                }
                const res = await api.post('/pricing/quote', payload)
                if (my !== seq) return
                quote.value = res.data?.data as QuoteSnapshot
            } catch (e: any) {
                if (my !== seq) return
                // Stale item (удалённый/недоступный товар или набор) — выкидываем и пересчитываем.
                const det = e?.response?.data?.error?.details
                if (det?.productId) {
                    const idx = items.value.findIndex(i => i.type === 'product' && i.refId === det.productId)
                    if (idx >= 0) { items.value.splice(idx, 1); refetch(); return }
                }
                if (det?.orderSetId) {
                    const idx = items.value.findIndex(i => i.type === 'set' && i.refId === det.orderSetId)
                    if (idx >= 0) { items.value.splice(idx, 1); refetch(); return }
                }
                quote.value = null
            } finally {
                quoting.value = false
            }
        }, 300)
    }

    watch(
        items,
        (v) => {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* ignore */ }
        },
        { deep: true },
    )

    // Начальный расчёт — если есть сохранённые позиции.
    refetch()

    return {
        items, lines, count, subtotal, total, discountTotal, hints, quote, quoting,
        qtyOfProduct, standaloneQty,
        addProduct, addSet, setProductQty, setQtyAt, removeAt, clear, setContext, refetch,
    }
})
