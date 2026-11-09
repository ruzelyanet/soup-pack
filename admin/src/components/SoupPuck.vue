<script setup lang="ts">
import { computed } from 'vue'
import { slugToVariant, type SoupVariant } from './soup-variants'

const props = withDefaults(
    defineProps<{
        variant?: SoupVariant
        slug?: string
        size?: number
    }>(),
    { variant: undefined, slug: undefined, size: 160 },
)

const GRADIENTS: Record<SoupVariant, string> = {
    'tom-yam':        'radial-gradient(circle at 34% 30%, #FF9B5E, #F05A22 45%, #B8300C)',
    'chicken-noodle': 'radial-gradient(circle at 34% 30%, #FFE29A, #F2B632 50%, #C98A12)',
    'pumpkin-cream':  'radial-gradient(circle at 34% 30%, #FFC27A, #F2861E 50%, #C45F0A)',
    'lentil':         'radial-gradient(circle at 34% 30%, #E39A55, #C0661F 50%, #8A4210)',
    'spaghetti':      'radial-gradient(circle at 34% 30%, #FF9B5E, #E04A2A 45%, #8A1A0A)',
    'cola':           'radial-gradient(circle at 34% 30%, #4D2A18, #1A0A05 60%, #000000)',
    'borsch':         'radial-gradient(circle at 34% 30%, #D14A5A, #8A1F2E 50%, #4E0F1A)',
    'kharcho':        'radial-gradient(circle at 34% 30%, #D97040, #A03818 50%, #5A1A08)',
    'minestrone':     'radial-gradient(circle at 34% 30%, #F2A860, #B86828 50%, #764516)',
    'mushroom-cream': 'radial-gradient(circle at 34% 30%, #E6D4B2, #9A7E5A 50%, #5C4531)',
    'default':        'radial-gradient(circle at 34% 30%, #FF9B5E, #F05A22 45%, #B8300C)',
}

const effectiveVariant = computed<SoupVariant>(() => props.variant ?? slugToVariant(props.slug))

const style = computed(() => ({
    width: props.size + 'px',
    height: props.size + 'px',
    background: GRADIENTS[effectiveVariant.value],
    boxShadow:
        '0 0 0 ' + Math.round(props.size * 0.05) + 'px rgba(255,255,255,0.65), ' +
        '0 ' + Math.round(props.size * 0.14) + 'px ' + Math.round(props.size * 0.2) +
        'px -' + Math.round(props.size * 0.08) + 'px rgba(60,20,0,.55)',
}))
</script>

<template>
    <div aria-hidden="true" class="relative rounded-full shrink-0" :style="style">
        <span
            class="absolute block pointer-events-none"
            style="left:12%; top:10%; width:46%; height:22%; border-radius:50%;
                   background: linear-gradient(160deg, rgba(255,255,255,.55), rgba(255,255,255,0));
                   transform: rotate(-30deg);"
        ></span>
    </div>
</template>
