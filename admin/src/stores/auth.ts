import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type StaffRole = 'manager' | 'duty' | 'courier'

export interface StaffEmployee {
    id: number
    documentId: string
    fullName: string
    phone: string
    role: StaffRole
}

const STORAGE_TOKEN = 'souppack.admin.token.v1'
const STORAGE_EMPLOYEE = 'souppack.admin.employee.v1'

function read<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}

export const useAuth = defineStore('auth', () => {
    const token = ref<string | null>(read<string | null>(STORAGE_TOKEN, null))
    const employee = ref<StaffEmployee | null>(read<StaffEmployee | null>(STORAGE_EMPLOYEE, null))

    const isAuthed = computed(() => Boolean(token.value && employee.value))
    const role = computed<StaffRole | null>(() => employee.value?.role ?? null)

    function setSession(t: string, e: StaffEmployee) {
        token.value = t
        employee.value = e
    }

    function logout() {
        token.value = null
        employee.value = null
        // Сообщить другим вкладкам закрыть SSE. Ленивый импорт — на случай, если
        // модуль ещё не загружен (странице логина realtime не нужен).
        import('@/services/realtimeLeader').then((m) => m.broadcastLogout()).catch(() => {})
    }

    watch(token, (v) => {
        if (v) localStorage.setItem(STORAGE_TOKEN, JSON.stringify(v))
        else localStorage.removeItem(STORAGE_TOKEN)
    })
    watch(employee, (v) => {
        if (v) localStorage.setItem(STORAGE_EMPLOYEE, JSON.stringify(v))
        else localStorage.removeItem(STORAGE_EMPLOYEE)
    })

    return { token, employee, isAuthed, role, setSession, logout }
})
