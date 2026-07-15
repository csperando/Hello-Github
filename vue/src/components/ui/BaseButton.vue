<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary'
    as?: 'button' | 'a' | 'router-link'
    to?: RouteLocationRaw
    href?: string
    disabled?: boolean
    loading?: boolean
    full?: boolean
  }>(),
  {
    variant: 'primary',
    as: 'button',
  },
)

const tag = computed(() => (props.as === 'router-link' ? RouterLink : props.as))

const tagProps = computed(() => {
  if (props.as === 'router-link') return { to: props.to }
  if (props.as === 'a') return { href: props.href }
  return { type: 'button' as const, disabled: props.disabled }
})

const baseStyle = computed(() => {
  let style = 'font-family:var(--font-mono);cursor:pointer;'
  style +=
    props.variant === 'primary'
      ? 'background:var(--color-accent);color:var(--color-accent-on);border:none;font-weight:600;'
      : 'background:transparent;'
  if (props.full) style += 'width:100%;'
  return style
})
</script>

<template>
  <component :is="tag" v-bind="tagProps" :style="baseStyle">
    <span
      v-if="loading"
      style="width:15px;height:15px;border-radius:50%;border:2px solid oklch(14% 0.03 145 / 0.35);border-top-color:oklch(14% 0.03 145);display:inline-block;animation:spin 0.7s linear infinite;"
    ></span>
    <slot />
  </component>
</template>
