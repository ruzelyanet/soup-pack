import { api, qs } from './api'
import type {
    RequestColumn, RequestFull, RequestGoal, RequestRow, RequestType,
    RequestValueField,
} from './resources'

type ListParams = {
    scope?: 'queue' | 'mine' | 'all'
    type?: RequestType
    outcome?: 'open' | 'converted' | 'lost'
    columnId?: number
    q?: string
    /** Сузить выборку конкретными id (до 50) — для догрузки по realtime-событию. */
    ids?: number[] | string
    page?: number
    pageSize?: number
}

export type PaginatedRequests = {
    data: RequestRow[]
    meta?: { pagination: { page: number; pageSize: number; pageCount: number; total: number } }
}

export const Requests = {
    async listColumns(): Promise<RequestColumn[]> {
        const res = await api.get('/staff/request-columns')
        return (res.data?.data ?? []) as RequestColumn[]
    },
    async createColumn(data: { name: string; color?: string; requireGoals?: boolean }): Promise<RequestColumn> {
        const res = await api.post('/staff/request-columns', data)
        return res.data?.data as RequestColumn
    },
    async updateColumn(id: number, data: Partial<RequestColumn>): Promise<RequestColumn> {
        const res = await api.put(`/staff/request-columns/${id}`, data)
        return res.data?.data as RequestColumn
    },
    async deleteColumn(id: number): Promise<void> {
        await api.delete(`/staff/request-columns/${id}`)
    },
    async reorderColumns(orderedIds: number[]): Promise<void> {
        await api.post('/staff/request-columns/reorder', { orderedIds })
    },

    async listGoals(columnId: number): Promise<RequestGoal[]> {
        const res = await api.get(`/staff/request-columns/${columnId}/goals`)
        return (res.data?.data ?? []) as RequestGoal[]
    },
    async createGoal(columnId: number, text: string): Promise<RequestGoal> {
        const res = await api.post(`/staff/request-columns/${columnId}/goals`, { text })
        return res.data?.data as RequestGoal
    },
    async updateGoal(columnId: number, goalId: number, data: Partial<RequestGoal>): Promise<RequestGoal> {
        const res = await api.put(`/staff/request-columns/${columnId}/goals/${goalId}`, data)
        return res.data?.data as RequestGoal
    },
    async deleteGoal(columnId: number, goalId: number): Promise<void> {
        await api.delete(`/staff/request-columns/${columnId}/goals/${goalId}`)
    },

    async list(params: ListParams = {}): Promise<RequestRow[]> {
        const q = {
            ...params,
            ids: Array.isArray(params.ids) ? params.ids.join(',') : params.ids,
        }
        const res = await api.get('/staff/requests' + qs(q))
        return (res.data?.data ?? []) as RequestRow[]
    },
    /** Серверная пагинация — отдаёт `{ data, meta }`, если переданы `page`+`pageSize`. */
    async listPaged(params: ListParams = {}): Promise<PaginatedRequests> {
        const q = {
            ...params,
            ids: Array.isArray(params.ids) ? params.ids.join(',') : params.ids,
        }
        const res = await api.get('/staff/requests' + qs(q))
        return {
            data: (res.data?.data ?? []) as RequestRow[],
            meta: res.data?.meta,
        }
    },
    async getOne(id: number): Promise<RequestFull> {
        const res = await api.get(`/staff/requests/${id}`)
        return res.data?.data as RequestFull
    },
    async create(data: {
        type: RequestType
        name: string
        phone: string
        values?: RequestValueField[]
        extra?: Record<string, any>
        comment?: string
        sourceDetail?: string
    }): Promise<RequestRow> {
        const res = await api.post('/staff/requests', data)
        return res.data?.data as RequestRow
    },
    async patch(id: number, data: Partial<RequestRow>): Promise<RequestRow> {
        const res = await api.patch(`/staff/requests/${id}`, data)
        return res.data?.data as RequestRow
    },
    async accept(id: number): Promise<RequestRow> {
        const res = await api.post(`/staff/requests/${id}/accept`, {})
        return res.data?.data as RequestRow
    },
    async reassign(id: number, employeeId: number | null): Promise<void> {
        await api.post(`/staff/requests/${id}/reassign`, { employeeId })
    },
    async move(id: number, columnId: number, position?: number | null): Promise<RequestRow> {
        const res = await api.post(`/staff/requests/${id}/move`, { columnId, position })
        return res.data?.data as RequestRow
    },
    async reorder(columnId: number, orderedIds: number[]): Promise<void> {
        await api.post('/staff/requests/reorder', { columnId, orderedIds })
    },
    async lose(id: number, reason: string, note?: string): Promise<void> {
        await api.post(`/staff/requests/${id}/lose`, { reason, note })
    },
    async reopen(id: number): Promise<void> {
        await api.post(`/staff/requests/${id}/reopen`, {})
    },
    async toggleGoal(id: number, stateId: number, done: boolean): Promise<void> {
        await api.post(`/staff/requests/${id}/goals/${stateId}`, { done })
    },
    async removeGoalFromRequest(id: number, stateId: number): Promise<void> {
        await api.delete(`/staff/requests/${id}/goals/${stateId}`)
    },
    async restoreGoals(id: number): Promise<void> {
        await api.post(`/staff/requests/${id}/goals/restore`, {})
    },
}
