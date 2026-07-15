<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  checked: boolean
}>()

const trackBg = computed(() => (props.checked ? 'oklch(58% 0.16 145)' : 'oklch(100% 0 0 / 0.14)'))
const knobLeft = computed(() => (props.checked ? '18px' : '2px'))
</script>

<template>
  <span :style="{ flex: 'none', width: '38px', height: '22px', borderRadius: '11px', background: trackBg, position: 'relative' }">
    <span :style="{ position: 'absolute', top: '2px', left: knobLeft, width: '18px', height: '18px', borderRadius: '50%', background: 'oklch(96% 0.004 250)', transition: 'left 0.15s' }"></span>
  </span>
</template>
