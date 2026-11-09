/**
 * Доступ бота к данным магазина. Бот не ходит в REST — читает Strapi напрямую
 * и оформляет заказ тем же сервисом, что и сайт (`api::order.order.buildAndCreate`).
 */
import path from 'node:path'
import type { PhotoSource } from './api'
import type { CartLine, CartView, ProductView, ShopContactView } from './texts'

export type CategoryView = { documentId: string; name: string }
export type ProductCard = ProductView & { photo: PhotoSource | null }

export type PlaceOrderInput = {
    fullName: string
    phone: string
    address: string
    /** Необязательны: клиент мог написать только адрес — точку отметит оператор. */
    lat: number | null
    lng: number | null
    cart: CartLine[]
    comment: string
}

/** Порт — чтобы бота можно было прогнать в тестах без Strapi. */
export interface CatalogPort {
    categories(): Promise<CategoryView[]>
    category(documentId: string): Promise<CategoryView | null>
    products(categoryDocumentId: string, offset: number, limit: number): Promise<{ items: ProductCard[]; total: number }>
    cartView(cart: CartLine[]): Promise<CartView & { cart: CartLine[] }>
    contact(): Promise<ShopContactView>
    placeOrder(input: PlaceOrderInput): Promise<{ code: string; total: number }>
}

const PRODUCT = 'api::product.product'
const CATEGORY = 'api::category.category'

export class StrapiCatalog implements CatalogPort {
    constructor(private strapi: any) {}

    async categories(): Promise<CategoryView[]> {
        const rows = await this.strapi.documents(CATEGORY).findMany({
            status: 'published',
            fields: ['name', 'sort'],
            sort: ['sort:asc', 'name:asc'],
            limit: 100,
        })
        // Пустые категории не показываем — в боте это тупик.
        const out: CategoryView[] = []
        for (const c of rows) {
            const total = await this.countProducts(c.documentId)
            if (total > 0) out.push({ documentId: c.documentId, name: c.name })
        }
        return out
    }

    async category(documentId: string): Promise<CategoryView | null> {
        const c = await this.strapi.documents(CATEGORY).findOne({ documentId, status: 'published', fields: ['name'] })
        return c ? { documentId: c.documentId, name: c.name } : null
    }

    private productFilters(categoryDocumentId: string) {
        return {
            category: { documentId: { $eq: categoryDocumentId } },
            available: { $ne: false },
        }
    }

    private countProducts(categoryDocumentId: string): Promise<number> {
        return this.strapi.documents(PRODUCT).count({
            status: 'published',
            filters: this.productFilters(categoryDocumentId),
        })
    }

    async products(categoryDocumentId: string, offset: number, limit: number) {
        const [total, rows] = await Promise.all([
            this.countProducts(categoryDocumentId),
            this.strapi.documents(PRODUCT).findMany({
                status: 'published',
                filters: this.productFilters(categoryDocumentId),
                fields: ['name', 'composition', 'description', 'weight', 'price'],
                populate: { image: true },
                sort: ['name:asc'],
                start: offset,
                limit,
            }),
        ])
        const ids = rows.map((r: any) => Number(r.id)) // id опубликованной версии — для движка цен
        const { products: pricing } = ids.length
            ? await this.strapi.service('api::price.pricing').catalogPricing({ productIds: ids, source: 'telegram' })
            : { products: {} as Record<number, any> }

        const items: ProductCard[] = rows.map((r: any) => {
            const pr = pricing[r.id]
            const base = Number(pr?.basePrice ?? r.price ?? 0)
            return {
                id: String(r.documentId),
                name: r.name,
                composition: r.composition,
                description: r.description,
                weight: r.weight,
                basePrice: base,
                finalPrice: Number(pr?.finalPrice ?? base),
                photo: this.photoOf(r.image),
            }
        })
        return { items, total: Number(total) }
    }

    /** Берём средний формат (≈750px) — быстрее грузится, чем оригинал. */
    private photoOf(image: any): PhotoSource | null {
        if (!image) return null
        const url: string | undefined =
            image.formats?.medium?.url || image.formats?.small?.url || image.url
        if (!url) return null
        if (/^https?:\/\//i.test(url)) return { url }
        const publicDir = this.strapi.dirs?.static?.public || path.join(process.cwd(), 'public')
        return { filePath: path.join(publicDir, url.replace(/^\/+/, '')) }
    }

    /** documentId → текущая опубликованная версия (id, name), только товары в продаже. */
    private async resolve(cart: CartLine[]) {
        const docIds = Array.from(new Set(cart.map((l) => l.documentId)))
        const rows = docIds.length
            ? await this.strapi.documents(PRODUCT).findMany({
                status: 'published',
                filters: { documentId: { $in: docIds } },
                fields: ['name', 'available'],
                limit: docIds.length,
            })
            : []
        return new Map<string, { id: number; name: string; available: boolean }>(
            rows.map((r: any) => [String(r.documentId), { id: Number(r.id), name: r.name, available: r.available !== false }]),
        )
    }

    async cartView(cart: CartLine[]): Promise<CartView & { cart: CartLine[] }> {
        const found = await this.resolve(cart)
        const removedNames: string[] = []
        let kept: CartLine[] = []
        for (const l of cart) {
            const p = found.get(l.documentId)
            if (p?.available) kept.push(l)
            else removedNames.push(p?.name || 'товар снят с продажи')
        }

        // Товар без активной цены и т. п. — выкидываем его и считаем остальное.
        let q: any = null
        for (let guard = 0; kept.length && guard < 20; guard++) {
            try {
                q = await this.quote(kept, found)
                break
            } catch (e: any) {
                const badId = Number(e?.details?.productId)
                const bad = kept.find((l) => found.get(l.documentId)?.id === badId)
                if (!bad) throw e
                removedNames.push(found.get(bad.documentId)!.name)
                kept = kept.filter((l) => l !== bad)
            }
        }
        if (!kept.length || !q) {
            return { cart: kept, lines: [], subtotal: 0, discountTotal: 0, total: 0, removedNames }
        }

        const byId = new Map<number, { name: string; qty: number; basePrice: number }>()
        for (const l of q.lines) {
            const pid = Number(l.productId)
            const cur = byId.get(pid)
            if (cur) cur.qty += l.qty
            else byId.set(pid, { name: l.name, qty: l.qty, basePrice: Number(l.basePrice) })
        }
        return {
            cart: kept,
            lines: kept
                .map((l) => ({ documentId: l.documentId, ...byId.get(found.get(l.documentId)!.id)! }))
                .filter((l) => l.name),
            subtotal: Number(q.subtotal),
            discountTotal: Number(q.discountTotal || 0),
            total: Number(q.total),
            removedNames,
        }
    }

    private quote(cart: CartLine[], found: Map<string, { id: number }>) {
        return this.strapi.service('api::price.pricing').quote({
            items: cart.map((l) => ({ type: 'product', productId: found.get(l.documentId)!.id, qty: l.qty })),
            deliveryMethod: 'courier_now',
            paymentMethod: 'cash',
            source: 'telegram',
        })
    }

    async contact(): Promise<ShopContactView> {
        const c = await this.strapi.documents('api::shop-contact.shop-contact').findFirst({})
        return { phone: c?.phone || '', workHours: c?.workHours || '', city: c?.city || '' }
    }

    async placeOrder(input: PlaceOrderInput) {
        const found = await this.resolve(input.cart)
        const items = input.cart
            .filter((l) => found.get(l.documentId)?.available)
            .map((l) => ({ productId: found.get(l.documentId)!.id, qty: l.qty }))
        if (!items.length) throw new Error('cart is empty after resolve')
        const created = await this.strapi.service('api::order.order').buildAndCreate({
            client: {
                fullName: input.fullName,
                phone: input.phone,
                address: input.address,
                lat: input.lat,
                lng: input.lng,
            },
            items,
            paymentMethod: 'cash',
            deliveryMethod: 'courier_now',
            comment: input.comment,
            address: input.address,
            lat: input.lat,
            lng: input.lng,
        }, { source: 'telegram' })
        return { code: String(created.code), total: Number(created.total || 0) }
    }
}
