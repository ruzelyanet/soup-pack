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
    const theme = ref<Theme>(readTheme())

    applyTheme(theme.value)

    function toggleTheme() {
        theme.value = theme.value === 'light' ? 'dark' : 'light'
    }

    watch(theme, (v) => {
        applyTheme(v)
        if (import.meta.client) {
            try { localStorage.setItem(THEME_KEY, v) } catch { /* ignore */ }
        }
    })

    return { theme, toggleTheme }
})
