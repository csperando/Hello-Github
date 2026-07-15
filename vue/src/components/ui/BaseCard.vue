<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    padding?: string
  }>(),
  {
    padding: 'clamp(28px,4vw,40px)',
  },
)

const baseStyle = computed(
  () =>
    `background:var(--color-bg-raised);border:1px solid var(--color-border);border-radius:14px;padding:${props.padding};box-shadow:0 24px 60px -20px oklch(0% 0 0 / 0.6);`,
)
</script>

<template>
  <div :style="baseStyle">
    <slot />
  </div>
</template>
