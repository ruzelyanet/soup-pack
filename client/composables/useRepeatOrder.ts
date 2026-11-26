import { useCart } from '@/stores/cart'
import { useCatalog } from '@/stores/catalog'
import type { Order, OrderSet, Product } from '@/types'

/**
 * Повторить заказ: собрать корзину заново из строк заказа.
 * - Каталог догружается, если его ещё нет (страница заказа открыта напрямую / после перезагрузки).
 * - Строки из набора восстанавливаются как набор (один экземпляр = одна позиция), а не россыпью товаров.
 * - Товар ищется по id, если id нет (старые заказы) — по названию.
 * - Корзина заменяется только если удалось что-то найти — иначе текущая корзина не трогается.
 */
export function useRepeatOrder() {
    const cart = useCart()
    const catalog = useCatalog()

    return async (order: Order): Promise<{ added: number; missing: string[] }> => {
        if (!catalog.products.length) {
            try { await catalog.fetchAll(true) } catch { /* ниже вернём missing */ }
        }
        const products = catalog.products as Product[]
        const sets = catalog.sets as OrderSet[]

        const findProduct = (id: number, name?: string) =>
            (id ? products.find((p) => p.id === id) : undefined)
            ?? (name ? products.find((p) => p.name === name) : undefined)

        const findSet = (id?: number, name?: string) =>
            (id ? sets.find((s) => s.id === id) : undefined)
            ?? (name ? sets.find((s) => s.name === name) : undefined)

        const productQty = new Map<number, { p: Product; qty: number }>()
        const setQty = new Map<number, { s: OrderSet; instances: Set<string> }>()
        const missing: string[] = []

        for (const line of order.items || []) {
            if (line.orderSetId || line.fromSetName) {
                const s = findSet(line.orderSetId, line.fromSetName)
                if (s) {
                    const entry = setQty.get(s.id) ?? { s, instances: new Set<string>() }
                    entry.instances.add(line.setInstance || `${s.id}`)
                    setQty.set(s.id, entry)
                    continue
                }
                // Набора больше нет — пробуем добавить его состав отдельными товарами.
            }
            const p = findProduct(line.productId, line.name)
            if (p) {
                const entry = productQty.get(p.id) ?? { p, qty: 0 }
                entry.qty += Math.max(1, Number(line.qty) || 1)
                productQty.set(p.id, entry)
            } else {
                missing.push(line.name)
            }
        }

        const added = productQty.size + setQty.size
        if (!added) return { added: 0, missing }

        cart.clear()
        for (const { s, instances } of setQty.values()) cart.addSet(s, instances.size)
        for (const { p, qty } of productQty.values()) cart.addProduct(p, qty)
        return { added, missing }
    }
}
