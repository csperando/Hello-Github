<script setup lang="ts">
    defineProps<{
        modelValue: string
        options: { value: string; label: string }[]
        id?: string
    }>()

    defineEmits<{ "update:modelValue": [value: string] }>()
</script>

<template>
    <select
        :id="id"
        :value="modelValue"
        class="base-select"
        @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
        <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
</template>

<style scoped>
    .base-select {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--font-sans);
        font-size: 14.5px;
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 8px;
        padding: 12px 14px;
    }
</style>
