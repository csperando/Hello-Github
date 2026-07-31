<script setup lang="ts">
defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  id?: string
}>()

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <select
    :id="id"
    :value="modelValue"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    style="width:100%;box-sizing:border-box;font-family:'IBM Plex Sans',sans-serif;font-size:14.5px;background:oklch(15% 0.012 250);color:oklch(96% 0.004 250);border:1px solid oklch(100% 0 0 / 0.12);border-radius:8px;padding:12px 14px;"
  >
    <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
  </select>
</template>
