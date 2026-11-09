import { api } from './api'
import type { RequestForm } from './resources'

export const RequestForms = {
    async list(): Promise<RequestForm[]> {
        const res = await api.get('/staff/request-forms')
        return (res.data?.data ?? []) as RequestForm[]
    },
    async get(id: number): Promise<RequestForm> {
        const res = await api.get(`/staff/request-forms/${id}`)
        return res.data?.data as RequestForm
    },
    async create(data: Partial<RequestForm>): Promise<RequestForm> {
        const res = await api.post('/staff/request-forms', data)
        return res.data?.data as RequestForm
    },
    async update(id: number, data: Partial<RequestForm>): Promise<RequestForm> {
        const res = await api.put(`/staff/request-forms/${id}`, data)
        return res.data?.data as RequestForm
    },
    async remove(id: number): Promise<void> {
        await api.delete(`/staff/request-forms/${id}`)
    },
    async rotateKey(id: number): Promise<string> {
        const res = await api.post(`/staff/request-forms/${id}/rotate-key`, {})
        return res.data?.data?.apiKey as string
    },
}
