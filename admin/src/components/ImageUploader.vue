<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

const props = defineProps<{
    /** Текущая картинка (base64 data-URL или URL). */
    modelValue?: string
    /** Пропорции превью. */
    aspect?: 'video' | 'square' | 'card'
    label?: string
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', v: string): void
    /** Исходный File — для последующей загрузки на сервер. null, когда картинку убрали. */
    (e: 'file', f: File | null): void
}>()

const input = useTemplateRef<HTMLInputElement>('input')
const dragOver = ref(false)

function open() {
    input.value?.click()
}

function pickFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
        emit('update:modelValue', String(reader.result || ''))
        emit('file', file)
    }
    reader.readAsDataURL(file)
}

function onChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) pickFile(file)
}

function onDrop(e: DragEvent) {
    e.preventDefault()
    dragOver.value = false
    const file = e.dataTransfer?.files?.[0]
    if (file) pickFile(file)
}

function clear() {
    emit('update:modelValue', '')
    emit('file', null)
}
</script>

<template>
    <div>
        <label v-if="label" class="text-xs font-bold uppercase tracking-wider text-ink-400">
            {{ label }}
        </label>
        <div
            :class="[
                'mt-1 relative rounded-xl border-2 border-dashed overflow-hidden transition cursor-pointer group',
                aspect === 'video' ? 'aspect-video' : aspect === 'card' ? 'aspect-[4/3]' : 'aspect-square',
                dragOver ? 'border-tomato-500 bg-tomato-500/5' : 'border-ink-200 hover:border-ink-400 bg-ink-50',
            ]"
            @click="open"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop="onDrop"
        >
            <input
                ref="input" type="file" accept="image/*" class="hidden"
                @change="onChange"
            />

            <template v-if="modelValue">
                <img :src="modelValue" alt="preview"
                     class="absolute inset-0 w-full h-full object-cover" />
                <div class="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div class="text-cream-50 text-sm font-semibold flex items-center gap-4">
                        <span class="inline-flex items-center gap-1">
                            <i class="pi pi-pencil text-xs"></i> Заменить
                        </span>
                        <button type="button"
                                class="inline-flex items-center gap-1 text-tomato-300 hover:text-tomato-200"
                                @click.stop="clear">
                            <i class="pi pi-trash text-xs"></i> Удалить
                        </button>
                    </div>
                </div>
            </template>

            <template v-else>
                <div class="absolute inset-0 flex flex-col items-center justify-center text-center px-6 py-4">
                    <div class="size-10 rounded-full bg-ink-900 text-cream-50 flex items-center justify-center">
                        <i class="pi pi-cloud-upload"></i>
                    </div>
                    <div class="mt-3 text-sm font-semibold text-ink-700">
                        Перетащите картинку или нажмите, чтобы выбрать
                    </div>
                    <div class="text-xs text-ink-400 mt-1">JPG, PNG, SVG · до 5 МБ</div>
                </div>
            </template>
        </div>
    </div>
</template>
