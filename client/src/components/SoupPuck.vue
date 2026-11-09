<script setup lang="ts">
import { computed } from 'vue'

type Variant =
    | 'tom-yam'
    | 'chicken-noodle'
    | 'pumpkin-cream'
    | 'lentil'
    | 'spaghetti'
    | 'cola'
    | 'default'

const props = withDefaults(
    defineProps<{
        variant?: Variant
        /** Диаметр диска в px. */
        size?: number
        /** Толстый светлый ободок как «вакуумная упаковка». */
        ring?: boolean
        /** Тень снизу. */
        shadow?: boolean
    }>(),
    { variant: 'default', size: 112, ring: true, shadow: true },
)

const GRADIENTS: Record<Variant, string> = {
    'tom-yam':        'radial-gradient(circle at 34% 30%, #FF9B5E, #F05A22 45%, #B8300C)',
    'chicken-noodle': 'radial-gradient(circle at 34% 30%, #FFE29A, #F2B632 50%, #C98A12)',
    'pumpkin-cream':  'radial-gradient(circle at 34% 30%, #FFC27A, #F2861E 50%, #C45F0A)',
    'lentil':         'radial-gradient(circle at 34% 30%, #E39A55, #C0661F 50%, #8A4210)',
    'spaghetti':      'radial-gradient(circle at 34% 30%, #FF9B5E, #E04A2A 45%, #8A1A0A)',
    'cola':           'radial-gradient(circle at 34% 30%, #4D2A18, #1A0A05 60%, #000000)',
    'default':        'radial-gradient(circle at 34% 30%, #FF9B5E, #F05A22 45%, #B8300C)',
}

const style = computed(() => ({
    width: props.size + 'px',
    height: props.size + 'px',
    background: GRADIENTS[props.variant],
    boxShadow: [
        props.ring  ? '0 0 0 ' + Math.round(props.size * 0.05) + 'px var(--color-ring)' : '',
        props.shadow ? '0 ' + Math.round(props.size * 0.14) + 'px ' + Math.round(props.size * 0.2) + 'px -' + Math.round(props.size * 0.08) + 'px rgba(60,20,0,.55)' : '',
    ].filter(Boolean).join(', '),
}))

/** scale px → относительно size:100, чтобы начинка внутри диска масштабировалась. */
const s = (v: number) => (v * props.size) / 100
</script>

<template>
    <div
        aria-hidden="true"
        class="relative rounded-full shrink-0"
        :style="style"
    >
        <!-- Блик на диске -->
        <span
            class="absolute block pointer-events-none"
            :style="{
                left: '12%', top: '10%',
                width: '46%', height: '22%',
                borderRadius: '50%',
                background: 'linear-gradient(160deg, rgba(255,255,255,.55), rgba(255,255,255,0))',
                transform: 'rotate(-30deg)',
            }"
        ></span>

        <!-- Том-ям: 3 креветки + 2 кинзы + гриб + шарик чили -->
        <template v-if="variant === 'tom-yam'">
            <span class="absolute block" :style="{ left:'18%', top:'22%', width: s(18)+'px', height: s(10)+'px', borderRadius:'50%', border: Math.max(2,s(3))+'px solid #FFB59A', borderBottomColor:'transparent', transform:'rotate(-20deg)' }"></span>
            <span class="absolute block" :style="{ right:'16%', top:'32%', width: s(16)+'px', height: s(9)+'px', borderRadius:'50%', border: Math.max(2,s(2.8))+'px solid #FFB59A', borderBottomColor:'transparent', transform:'rotate(30deg)' }"></span>
            <span class="absolute block" :style="{ left:'26%', bottom:'18%', width: s(15)+'px', height: s(8)+'px', borderRadius:'50%', border: Math.max(2,s(2.8))+'px solid #FFB59A', borderBottomColor:'transparent', transform:'rotate(160deg)' }"></span>
            <span class="absolute block" :style="{ left:'46%', top:'12%', width: s(8)+'px', height: s(4)+'px', borderRadius:'50% 0', background:'#4E8A2E', transform:'rotate(30deg)' }"></span>
            <span class="absolute block" :style="{ right:'26%', bottom:'20%', width: s(9)+'px', height: s(5)+'px', borderRadius:'50% 0', background:'#4E8A2E' }"></span>
            <span class="absolute block" :style="{ left:'42%', top:'44%', width: s(10)+'px', height: s(10)+'px', borderRadius:'50%', background:'#F7E0B5' }"></span>
            <span class="absolute block" :style="{ right:'14%', top:'58%', width: s(5)+'px', height: s(5)+'px', borderRadius:'50%', background:'#8E1A06' }"></span>
        </template>

        <!-- Куриный с лапшой: завитки лапши -->
        <template v-else-if="variant === 'chicken-noodle'">
            <span class="absolute" :style="{ left:'16%', top:'32%', width:'68%', height: s(4)+'px', borderRadius:'999px', background:'#FFF2C5', opacity:0.9 }"></span>
            <span class="absolute" :style="{ left:'12%', top:'48%', width:'72%', height: s(4)+'px', borderRadius:'999px', background:'#FFF2C5', opacity:0.9 }"></span>
            <span class="absolute" :style="{ left:'18%', top:'62%', width:'62%', height: s(4)+'px', borderRadius:'999px', background:'#FFF2C5', opacity:0.9 }"></span>
            <span class="absolute block" :style="{ left:'22%', top:'22%', width: s(8)+'px', height: s(8)+'px', borderRadius:'50%', background:'#F8E6C0' }"></span>
            <span class="absolute block" :style="{ right:'20%', bottom:'22%', width: s(7)+'px', height: s(7)+'px', borderRadius:'50%', background:'#F8E6C0' }"></span>
            <span class="absolute block" :style="{ left:'52%', top:'18%', width: s(5)+'px', height: s(5)+'px', borderRadius:'50%', background:'#4E8A2E' }"></span>
        </template>

        <!-- Крем-суп тыквенный: семечки -->
        <template v-else-if="variant === 'pumpkin-cream'">
            <span class="absolute block" :style="{ left:'22%', top:'24%', width: s(5)+'px', height: s(8)+'px', borderRadius:'50%', background:'#4E5A20', transform:'rotate(20deg)' }"></span>
            <span class="absolute block" :style="{ right:'24%', top:'28%', width: s(5)+'px', height: s(8)+'px', borderRadius:'50%', background:'#4E5A20', transform:'rotate(-30deg)' }"></span>
            <span class="absolute block" :style="{ left:'30%', bottom:'22%', width: s(5)+'px', height: s(8)+'px', borderRadius:'50%', background:'#4E5A20', transform:'rotate(-10deg)' }"></span>
            <span class="absolute block" :style="{ right:'28%', bottom:'26%', width: s(5)+'px', height: s(8)+'px', borderRadius:'50%', background:'#4E5A20', transform:'rotate(25deg)' }"></span>
            <span class="absolute block" :style="{ left:'46%', top:'44%', width: s(4)+'px', height: s(4)+'px', borderRadius:'50%', background:'rgba(255,255,255,0.6)' }"></span>
        </template>

        <!-- Чечевица: горошины -->
        <template v-else-if="variant === 'lentil'">
            <template v-for="(dot, i) in 10" :key="i">
                <span
                    class="absolute block"
                    :style="{
                        left:  (18 + (i * 61) % 60) + '%',
                        top:   (18 + (i * 43) % 60) + '%',
                        width: s(5)+'px', height: s(5)+'px',
                        borderRadius: '50%',
                        background: '#4A1810',
                    }"
                ></span>
            </template>
        </template>

        <!-- Спагетти: длинные линии + томатные капли -->
        <template v-else-if="variant === 'spaghetti'">
            <span class="absolute" :style="{ left:'8%', top:'32%', width:'84%', height: s(3)+'px', borderRadius:'999px', background:'#F7D06A', opacity:0.95 }"></span>
            <span class="absolute" :style="{ left:'10%', top:'48%', width:'80%', height: s(3)+'px', borderRadius:'999px', background:'#F7D06A', opacity:0.95 }"></span>
            <span class="absolute" :style="{ left:'14%', top:'64%', width:'72%', height: s(3)+'px', borderRadius:'999px', background:'#F7D06A', opacity:0.95 }"></span>
            <span class="absolute block" :style="{ left:'32%', top:'22%', width: s(6)+'px', height: s(6)+'px', borderRadius:'50%', background:'#5A1810' }"></span>
            <span class="absolute block" :style="{ right:'22%', bottom:'20%', width: s(6)+'px', height: s(6)+'px', borderRadius:'50%', background:'#5A1810' }"></span>
            <span class="absolute block" :style="{ right:'20%', top:'22%', width: s(5)+'px', height: s(5)+'px', borderRadius:'50%', background:'#4E8A2E' }"></span>
        </template>

        <!-- Кола: пузыри -->
        <template v-else-if="variant === 'cola'">
            <span class="absolute block" :style="{ left:'22%', top:'22%', width: s(6)+'px', height: s(6)+'px', borderRadius:'50%', background:'rgba(255,255,255,.7)' }"></span>
            <span class="absolute block" :style="{ right:'20%', top:'28%', width: s(5)+'px', height: s(5)+'px', borderRadius:'50%', background:'rgba(255,255,255,.65)' }"></span>
            <span class="absolute block" :style="{ left:'28%', bottom:'22%', width: s(4)+'px', height: s(4)+'px', borderRadius:'50%', background:'rgba(255,255,255,.6)' }"></span>
            <span class="absolute block" :style="{ right:'30%', bottom:'24%', width: s(5)+'px', height: s(5)+'px', borderRadius:'50%', background:'rgba(255,255,255,.6)' }"></span>
        </template>
    </div>
</template>
