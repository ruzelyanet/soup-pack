import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

type Theme = 'light' | 'dark'
const THEME_KEY = 'souppack.theme.v1'

function readTheme(): Theme {
    if (!import.meta.client) return 'light'
    try {
        const v = localStorage.getItem(THEME_KEY)
        if (v === 'dark' || v === 'light') return v
    } catch { /* ignore */ }
    return 'light'
}

function applyTheme(t: Theme) {
    if (!import.meta.client) return
    document.documentElement.setAttribute('data-theme', t)
}

export const useUi = defineStore('ui', () => {
    // На SSR и в первом тике клиента — всегда 'light' (совпадает).
    const theme = ref<Theme>('light')

    function toggleTheme() {
        theme.value = theme.value === 'light' ? 'dark' : 'light'
    }

    if (import.meta.client) {
        // Тему читаем и применяем после гидрации, чтобы не трогать <html data-theme=> до неё.
        setTimeout(() => {
            theme.value = readTheme()
            applyTheme(theme.value)
        }, 0)
        watch(theme, (v) => {
            applyTheme(v)
            try { localStorage.setItem(THEME_KEY, v) } catch { /* ignore */ }
        })
    }

    return { theme, toggleTheme }
})
