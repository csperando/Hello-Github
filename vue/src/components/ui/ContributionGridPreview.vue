<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    cells: { bg: string }[]
    weeks?: number
  }>(),
  {
    weeks: 24,
  },
)

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${props.weeks}, 1fr)`,
  gridTemplateRows: 'repeat(7,1fr)',
  gridAutoFlow: 'column',
  gap: '2px',
  aspectRatio: `${props.weeks}/7`,
}))
</script>

<template>
  <div :style="gridStyle">
    <div v-for="(cell, i) in cells" :key="i" :style="{ borderRadius: '1px', background: cell.bg }"></div>
  </div>
</template>
