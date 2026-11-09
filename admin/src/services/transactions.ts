import { api, qs } from './api'
import type { PaymentMethod, Transaction, TransactionsSummary } from './resources'

type PaymentBody = {
    amount: number
    method: PaymentMethod
    receivedById?: number | null
    comment?: string | null
    paidAt?: string | null
    idempotencyKey?: string | null
    allowOverpay?: boolean
}

type RefundBody = {
    amount: number
    method: PaymentMethod
    receivedById?: number | null
    comment: string
    paidAt?: string | null
    idempotencyKey?: string | null
}

type ListFilters = {
    from?: string
    to?: string
    method?: PaymentMethod
    employeeId?: number
    kind?: 'payment' | 'refund'
    status?: 'completed' | 'cancelled'
    code?: string        // код транзакции (contains)
    orderCode?: string   // код заказа (contains)
    page?: number
    pageSize?: number
}

export type PaginatedTransactions = {
    data: Transaction[]
    meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } }
}

export const Transactions = {
    async createPayment(orderId: number, body: PaymentBody): Promise<Transaction> {
        const res = await api.post(`/staff/orders/${orderId}/payments`, body)
        return res.data?.data as Transaction
    },
    async createRefund(orderId: number, body: RefundBody): Promise<Transaction> {
        const res = await api.post(`/staff/orders/${orderId}/refunds`, body)
        return res.data?.data as Transaction
    },
    async cancel(id: number, reason: string): Promise<Transaction> {
        const res = await api.post(`/staff/transactions/${id}/cancel`, { reason })
        return res.data?.data as Transaction
    },
    async list(filters: ListFilters = {}): Promise<PaginatedTransactions> {
        const res = await api.get('/staff/transactions' + qs(filters))
        return {
            data: (res.data?.data ?? []) as Transaction[],
            meta: res.data?.meta ?? { pagination: { page: 1, pageSize: filters.pageSize || 25, pageCount: 1, total: 0 } },
        }
    },
    async summary(filters: Pick<ListFilters, 'from' | 'to'> = {}): Promise<TransactionsSummary> {
        const res = await api.get('/staff/transactions/summary' + qs(filters))
        return res.data?.data as TransactionsSummary
    },
}
