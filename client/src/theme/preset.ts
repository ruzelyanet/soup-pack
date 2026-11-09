import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

export const SoupPuckPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50:  '#fde9e3',
            100: '#f9c7bb',
            200: '#f29580',
            300: '#e86d50',
            400: '#dd5330',
            500: '#D63A1C',
            600: '#B8300C',
            700: '#8f2409',
            800: '#651907',
            900: '#430f04',
            950: '#2a0803',
        },
    },
    components: {
        button: { root: { borderRadius: '18px' } },
    },
})
