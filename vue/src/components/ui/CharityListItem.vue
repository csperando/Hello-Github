<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    letter: string
    focus?: string
    borderColor: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  {
    size: 'lg',
  },
)

const wrapperStyle = computed(() => {
  const border = `border-width:1px;border-style:solid;border-color:${props.borderColor};`
  if (props.size === 'sm') {
    return `cursor:pointer;display:flex;gap:10px;align-items:center;padding:12px;border-radius:8px;background:var(--color-bg);${border}`
  }
  if (props.size === 'md') {
    return `cursor:pointer;display:flex;gap:12px;align-items:flex-start;padding:13px;border-radius:10px;background:var(--color-bg-raised);${border}`
  }
  return `display:flex;gap:14px;align-items:flex-start;padding:16px;border-radius:10px;background:var(--color-bg-raised);${border}`
})

const avatarStyle = computed(() => {
  const common =
    'flex:none;background:var(--color-bg-chip);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-weight:700;color:var(--color-accent-bright);'
  if (props.size === 'sm') {
    return `${common}width:28px;height:28px;border-radius:6px;font-size:12px;`
  }
  if (props.size === 'md') {
    return `${common}width:32px;height:32px;border-radius:8px;font-size:13px;`
  }
  return `${common}width:36px;height:36px;border-radius:8px;`
})

const nameStyle = computed(() => {
  if (props.size === 'md') {
    return 'font-family:var(--font-mono);font-size:13px;font-weight:600;margin-bottom:2px;'
  }
  return 'font-family:var(--font-mono);font-size:14.5px;font-weight:600;margin-bottom:3px;'
})

const focusStyle = computed(() => {
  if (props.size === 'md') {
    return 'font-size:12px;line-height:1.4;color:var(--color-text-muted-4);'
  }
  return 'font-size:13px;line-height:1.5;color:var(--color-text-muted-3);'
})
</script>

<template>
  <div :style="wrapperStyle">
    <div :style="avatarStyle">{{ letter }}</div>
    <div v-if="size !== 'sm'">
      <div :style="nameStyle">{{ name }}</div>
      <div v-if="focus" :style="focusStyle">{{ focus }}</div>
    </div>
    <span v-else style="font-family:var(--font-mono);font-size:13px;">{{ name }}</span>
  </div>
</template>
