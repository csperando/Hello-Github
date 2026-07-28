<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    cells: { bg: string }[]
    weeks?: number
    /**
     * Fixed height (any CSS length), for callers showing several previews of
     * varying `weeks` side by side (e.g. a dashboard grid of design cards) -
     * without it, a narrower pattern gets a taller aspect-ratio box than a
     * wider one, so tiles in the same layout end up inconsistently sized.
     * When omitted, falls back to the original aspect-ratio-driven sizing.
     */
    height?: string
  }>(),
  {
    weeks: 24,
  },
)

// Below this, cells become too thin to read - scroll the grid horizontally
// within its own container instead of shrinking cells indefinitely.
const MIN_CELL_PX = 6

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${props.weeks}, 1fr)`,
  gridTemplateRows: 'repeat(7,1fr)',
  gridAutoFlow: 'column',
  gap: '2px',
  minWidth: `${props.weeks * MIN_CELL_PX}px`,
  ...(props.height ? { height: props.height } : { aspectRatio: `${props.weeks}/7` }),
}))
</script>

<template>
  <div style="width:100%;overflow-x:auto;">
    <div :style="gridStyle">
      <div v-for="(cell, i) in cells" :key="i" :style="{ borderRadius: '1px', background: cell.bg }"></div>
    </div>
  </div>
</template>
