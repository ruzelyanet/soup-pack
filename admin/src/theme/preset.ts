import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

export const SoupPuckAdminPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50:  '#fdece8',
            100: '#fbd3ca',
            200: '#f6a28f',
            300: '#ed7558',
            400: '#de5538',
            500: '#d14836',
            600: '#b03628',
            700: '#8a281e',
            800: '#651d15',
            900: '#43130e',
            950: '#2a0c08',
        },
    },
    components: {
        button: { root: { borderRadius: '10px' } },
        datatable: { root: { borderRadius: '14px' } },
    },
})
