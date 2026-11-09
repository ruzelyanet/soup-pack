import { api, qs } from './api'
import type { DashboardData, RequestSetting, SlaPublic } from './resources'

export const Settings = {
    async getRequestSettings(): Promise<RequestSetting> {
        const res = await api.get('/staff/request-settings')
        return res.data?.data as RequestSetting
    },
    async updateRequestSettings(patch: Partial<RequestSetting>): Promise<RequestSetting> {
        const res = await api.put('/staff/request-settings', patch)
        return res.data?.data as RequestSetting
    },
    async testTelegram(): Promise<{ ok: boolean; errors: string[] }> {
        const res = await api.post('/staff/request-settings/telegram-test', {})
        return res.data?.data as { ok: boolean; errors: string[] }
    },
    async getSla(): Promise<SlaPublic> {
        const res = await api.get('/staff/request-settings/sla')
        return res.data?.data as SlaPublic
    },
    async dashboard(params: { from?: string; to?: string } = {}): Promise<DashboardData> {
        const res = await api.get('/staff/dashboard' + qs(params))
        return res.data?.data as DashboardData
    },
}
