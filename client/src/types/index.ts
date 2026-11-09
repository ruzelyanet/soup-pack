export interface Category {
    id: number
    name: string
    slug: string
    sort?: number
}

export interface Banner {
    id: number
    title: string
    subtitle?: string
    linkUrl?: string
    sort?: number
    active?: boolean
    image?: { url?: string } | null
}

export interface HomeSection {
    id: number
    title: string
    slug: string
    icon?: string | null
    sort?: number
    visible: boolean
    isHits: boolean
    isSets: boolean
    category?: Category | null
    products?: Product[] | null
}

export type SoupVariant =
    | 'tom-yam'
    | 'chicken-noodle'
    | 'pumpkin-cream'
    | 'lentil'
    | 'spaghetti'
    | 'cola'
    | 'default'

export interface ProductPricing {
    basePrice: number
    finalPrice: number
    discountPercent: number
    label?: string | null
    endsAt?: string | null
    nextPrice?: null
}

export interface Product {
    id: number
    name: string
    slug: string
    subtitle?: string
    description?: string
    composition?: string[] | string
    weight?: number
    price: number
    /** Strapi media object. */
    image?: { url?: string } | string | null
    gallery?: Array<{ id?: number; url?: string }> | null
    /** Пресет для SVG-мока «шайба супа». */
    variant?: SoupVariant
    /** CSS var токен для фоновой подложки карточки (tint-tom/chi/pum/len/spa/col). */
    tint?: 'tom' | 'chi' | 'pum' | 'len' | 'spa' | 'col'
    category?: Category
    available: boolean
    tags?: string[]
    reheatSteps?: string[]
    nutrition?: { kcal?: number; protein?: number; fat?: number; carbs?: number }
    storage?: string
    /** Серверный расчёт цены и скидки. */
    pricing?: ProductPricing | null
}

export interface OrderSet {
    id: number
    name: string
    slug: string
    description?: string
    banner?: string
    showInCatalog?: boolean
    items: Array<{ product: Product; qty: number }>
    pricing?: (ProductPricing & { itemsTotal?: number }) | null
}

export interface CartLine {
    productId: number
    name: string
    /** Цена за штуку с учётом всех скидок товара и набора. */
    price: number
    image?: string
    qty: number
    orderSetId?: number
    /** Процент скидки от набора (если позиция попала в корзину как часть набора). */
    setDiscountPercent?: number
    /** Название набора, из которого пришла позиция. */
    fromSetName?: string
}

export interface Client {
    id?: number
    fullName: string
    phone: string
    address?: string
    /** Координаты точки доставки (если выбирали на карте). */
    lat?: number
    lng?: number
}

export type OrderStatus =
    | 'new'
    | 'accepted'
    | 'in_progress'
    | 'done'
    | 'canceled'

export interface OrderLineDiscount {
    /** Новое поле (с переименования promotion→discount). Старые заказы читаются через `promotionId`. */
    discountId?: number
    /** @deprecated — читаем для совместимости со старыми заказами. */
    promotionId?: number
    version: number
    name: string
    level: 'line' | 'set' | 'order'
    benefitType: string
    benefitValue: number
    amount: number
}

export interface OrderLine {
    productId: number
    name: string
    price: number
    qty: number
    /** Снимок цены за штуку до скидок. */
    basePrice?: number
    /** Цена за штуку после скидок уровня line/set (без order). */
    unitPrice?: number
    /** Срезано со строки order-уровневой скидкой. */
    orderDiscountAmount?: number
    /** Итог по строке (unitPrice × qty − orderDiscountAmount). */
    lineTotal?: number
    /** Если строка — часть набора: его id в чеке. */
    orderSetId?: number
    /** Экземпляр набора (одно значение на несколько строк одного набора). */
    setInstance?: string
    /** Название набора, из которого пришла строка. */
    fromSetName?: string
    /** Применённые к строке скидки (snapshot на момент заказа). */
    discounts?: OrderLineDiscount[]
}

export interface ShopContact {
    phone?: string | null
    workHours?: string | null
    city?: string | null
}

export type OrderPaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'refunded'

export interface Order {
    id?: number
    code?: string
    client: Client
    items: OrderLine[]
    comment?: string
    paymentMethod?: 'cash' | 'card'
    total: number
    /** Суммарная скидка по заказу (snapshot). */
    discountTotal?: number
    status?: OrderStatus
    cancelReason?: string
    employeeId?: number | null
    createdAt?: string
    paymentStatus?: OrderPaymentStatus
    paidAmount?: number
}
