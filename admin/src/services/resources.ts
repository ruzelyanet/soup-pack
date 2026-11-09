import { resource } from './api'

interface Base { id: number; documentId: string }

export interface Category   extends Base { name: string; slug?: string; sort?: number }
export interface Product extends Base {
    name: string; slug: string; description?: string
    /** Массив ингредиентов. Легаси-данные могут приходить как строка — нормализуем на фронте. */
    composition?: string[] | string | null
    weight?: number; price: number
    available: boolean; tags?: string[] | null
    category?: Category | null
    image?: { url: string } | null
    gallery?: Array<{ id: number; url: string }> | null
    /** Серверный расчёт цены и скидки (базовая/финальная/процент/метка/конец периода). */
    pricing?: {
        basePrice: number; finalPrice: number; discountPercent: number
        label?: string | null; endsAt?: string | null; nextPrice?: null
    } | null
}
export interface Banner     extends Base { title: string; subtitle?: string; linkUrl?: string; sort?: number; active: boolean; image?: { url: string } | null }
export interface HomeSection extends Base {
    title: string; slug?: string; icon?: string | null
    sort?: number; visible: boolean; isHits: boolean; isSets: boolean
    category?: Category | null
    products?: Product[] | null
}
export interface OrderSetItem { product: Product | null; qty: number }
export interface OrderSet   extends Base {
    name: string; slug: string; description?: string
    showInCatalog: boolean
    linkUrl?: string; banner?: { url: string } | null
    items: OrderSetItem[]
    pricing?: {
        basePrice: number; finalPrice: number; discountPercent: number
        label?: string | null; endsAt?: string | null; itemsTotal?: number
    } | null
}
export interface Employee extends Base {
    fullName: string; phone: string
    role: 'manager' | 'duty' | 'courier'
    personalKey: string
    dutyFrom?: string | null; dutyTo?: string | null
}
export interface Client extends Base {
    fullName: string; phone: string; address?: string
    lat?: number | null; lng?: number | null
    orders?: Order[]
}
export type OrderStatus = 'new' | 'accepted' | 'in_progress' | 'done' | 'canceled'
export interface OrderLineDiscountSnapshot {
    /** Новое поле (с переименования promotion→discount). Старые заказы читаются через `promotionId`. */
    discountId?: number
    /** @deprecated — читаем для совместимости со старыми заказами. */
    promotionId?: number
    version: number
    name: string
    level: 'line' | 'set' | 'order'
    benefitType: 'percent' | 'fixed_amount' | 'fixed_price'
    benefitValue: number
    amount: number
}
export interface OrderLine {
    id?: number
    product?: Product | null
    name: string
    price: number
    qty: number
    fromSetName?: string | null
    // Фаза 3:
    lineKey?: string | null
    basePrice?: number | null
    priceId?: number | null
    unitPrice?: number | null
    orderDiscountAmount?: number | null
    lineTotal?: number | null
    orderSetId?: number | null
    setInstance?: string | null
    discounts?: OrderLineDiscountSnapshot[] | null
}
export type OrderSource = 'catalog' | 'request' | 'manual' | 'telegram'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'refunded'

export interface Order extends Base {
    code: string; status: OrderStatus; cancelReason?: string
    paymentMethod?: 'cash' | 'card' | 'click' | 'payme' | 'transfer'
    deliveryMethod?: 'courier_now' | 'preorder'
    deliverySlotAt?: string | null
    comment?: string
    subtotal?: number | null
    cartDiscountPercent?: number | null
    cartDiscountAmount?: number | null
    discountTotal?: number | null
    total: number
    address?: string
    lat?: number | null
    lng?: number | null
    createdAt: string
    source?: OrderSource
    paidAmount?: number | null
    paymentStatus?: PaymentStatus
    client?: Client | null
    employee?: Employee | null
    createdByEmployee?: Employee | null
    request?: { id: number; documentId: string; code: string } | null
    items: OrderLine[]
}

export interface OrderPreview {
    items: OrderLine[]
    subtotal: number
    cartDiscountPercent: number | null
    cartDiscountAmount: number | null
    total: number
    discountTotal?: number
    hints?: Array<{ code: string; discountId: number; missing: number; label: string }>
    deliveryMethod: 'courier_now' | 'preorder'
}

// --- Транзакции ---

export type TransactionKind = 'payment' | 'refund'
export type TransactionStatus = 'completed' | 'cancelled'
export type PaymentMethod = 'cash' | 'card' | 'click' | 'payme' | 'transfer'

export interface Transaction extends Base {
    code: string
    kind: TransactionKind
    method: PaymentMethod
    amount: number
    currency: string
    status: TransactionStatus
    paidAt: string
    comment?: string | null
    externalId?: string | null
    idempotencyKey?: string | null
    cancelledAt?: string | null
    cancelReason?: string | null
    createdAt: string
    order?: Order | null
    client?: Client | null
    receivedBy?: Employee | null
    createdByEmployee?: Employee | null
    cancelledBy?: Employee | null
}

export interface TransactionsSummary {
    byMethod: Record<string, { payments: number; refunds: number; net: number }>
    cashOnHand: Array<{ employee: Employee; total: number }>
}

// --- Настройки заявок (SLA + Telegram) ---

export interface RequestSetting {
    yellowAfterMin: number
    redAfterMin: number
    telegramEnabled: boolean
    telegramChatIds?: string | null
    telegramBotToken?: string | null
    telegramBotTokenSet?: boolean
    overdueCheckEnabled: boolean
    /** Магазин в Telegram-боте для клиентов (тот же Bot token). */
    shopBotEnabled?: boolean
    shopBotGreeting?: string | null
    /** Состояние бота на сервере (только чтение). */
    shopBot?: {
        state: 'off' | 'starting' | 'running' | 'error'
        username?: string | null
        error?: string | null
        reason?: 'no_token' | 'disabled' | 'env_disabled' | null
    }
}

export interface SlaPublic {
    yellowAfterMin: number
    redAfterMin: number
}

// --- Дашборд ---

export interface DashboardData {
    from: string
    to: string
    unassignedRequestsCount: number
    avgTimeToAcceptMinutes: number
    conversionByType: Record<string, { requests: number; converted: number; rate: number }>
    conversionByEmployee: Array<{ id: number; name: string; requests: number; converted: number; rate: number }>
    salesTotal: number
    receiptsTotal: number
    paymentsSum: number
    refundsSum: number
}

// Админка ходит через staff-прокси — там is-staff policy спуфит ctx.state.auth
// под full-access, поэтому strictRelations не отрезает populate.
export const Categories = resource<Category>('staff/categories')
export const Products   = resource<Product>('staff/products')
export const Banners    = resource<Banner>('staff/banners')
export const HomeSections = resource<HomeSection>('staff/home-sections')
export const OrderSets  = resource<OrderSet>('staff/order-sets')
export const Orders     = resource<Order>('orders')     // уже под is-staff в основном роутере
export const Clients    = resource<Client>('clients')    // уже под is-staff
export const Employees  = resource<Employee>('employees')// уже под is-staff manager-only

export interface ShopContact {
    phone?: string | null
    workHours?: string | null
    city?: string | null
}

/** Строка истории цен товара (/staff/products/:id/prices). */
export interface Price {
    id: number
    documentId?: string
    amount: number
    validFrom: string
    validTo: string | null
    comment?: string | null
    createdByEmployee?: { id: number; fullName?: string } | null
}

// ─── Скидки (phase 3) ───

export type DiscountLevel = 'line' | 'set' | 'order'
export type BenefitType = 'percent' | 'fixed_amount' | 'fixed_price'
export type DiscountStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface DiscountTarget {
    id?: number
    documentId?: string
    targetType: 'product' | 'category' | 'order-set' | 'all-products'
    product?: { id: number; name?: string } | null
    category?: { id: number; name?: string } | null
    orderSet?: { id: number; name?: string } | null
    exclude?: boolean
}

export interface DiscountConditions {
    minSubtotal?: number
    minQty?: number
    deliveryMethods?: string[]
    paymentMethods?: string[]
    clientKinds?: ('individual' | 'shop')[]
    weekdays?: number[]
    timeFrom?: string
    timeTo?: string
    sources?: ('catalog' | 'request' | 'manual' | 'telegram')[]
}

export interface Discount extends Base {
    name: string
    publicLabel?: string | null
    status: DiscountStatus
    level: DiscountLevel
    benefitType: BenefitType
    benefitValue: number
    maxDiscountAmount?: number | null
    startsAt?: string | null
    endsAt?: string | null
    conditions?: DiscountConditions | null
    priority: number
    stackable: boolean
    exclusiveGroup?: string | null
    showInCatalog: boolean
    version: number
    targets?: DiscountTarget[]
    _stats?: { applications: number; amountTotal: number }
}

// --- Заявки ---

export type RequestType = 'individual' | 'shop'
export type RequestOutcome = 'open' | 'converted' | 'lost'
export type RequestSource = 'manual' | 'form' | 'api'
export type ColumnKind = 'new' | 'custom' | 'done'

export interface RequestColumn extends Base {
    name: string
    color?: string | null
    kind: ColumnKind
    position: number
    requireGoals?: boolean
    requestsCount?: number
}

export interface RequestGoal extends Base {
    text: string
    position: number
    column?: { id: number } | null
}

export interface RequestGoalState extends Base {
    done: boolean
    removed: boolean
    goalText?: string | null
    goal?: { id: number } | null
    column?: { id: number } | null
}

export interface RequestEvent extends Base {
    kind: string
    payload?: any
    note?: string | null
    createdAt: string
    actor?: Employee | null
}

export interface RequestValueField { key: string; label: string; value: unknown }

export interface RequestRow extends Base {
    code: string
    type: RequestType
    name: string
    phone: string
    values?: RequestValueField[] | null
    extra?: Record<string, any> | null
    comment?: string | null
    source: RequestSource
    sourceDetail?: string | null
    position: number
    acceptedById?: number | null
    acceptedAt?: string | null
    outcome: RequestOutcome
    lostReason?: string | null
    lostNote?: string | null
    lockedAt?: string | null
    archived: boolean
    columnEnteredAt?: string | null
    createdAt: string
    updatedAt: string
    column?: RequestColumn | null
    assignee?: Employee | null
    client?: Client | null
    createdByEmployee?: Employee | null
}

export interface RequestFull {
    request: RequestRow
    events: RequestEvent[]
    goalStates: RequestGoalState[]
}

// --- Формы заявок ---

export type FormFieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'checkbox' | 'address'

export interface FormFieldSchema {
    key: string
    label: string
    type: FormFieldType
    required?: boolean
    options?: string[]
    placeholder?: string
    position?: number
}

export interface RequestForm extends Base {
    name: string
    slug: string
    type: RequestType
    isActive: boolean
    title?: string | null
    description?: string | null
    fields: FormFieldSchema[]
    successMessage?: string | null
    sourceDetail?: string | null
    requireApiKey: boolean
    apiKeySet?: boolean
}
