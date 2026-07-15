<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    steps: string[]
    current: number
    lineWidth?: string
  }>(),
  {
    lineWidth: '24px',
  },
)

const stepMeta = computed(() =>
  props.steps.map((label, i) => {
    const n = i + 1
    const active = n === props.current
    const complete = n < props.current
    return {
      n,
      label,
      showLine: i < props.steps.length - 1,
      dotBg: complete ? 'oklch(58% 0.16 145)' : active ? 'oklch(58% 0.16 145 / 0.2)' : 'transparent',
      dotColor: complete ? 'oklch(14% 0.03 145)' : active ? 'oklch(72% 0.16 145)' : 'oklch(55% 0.01 250)',
      dotBorder: complete ? 'transparent' : active ? 'oklch(58% 0.16 145)' : 'oklch(100% 0 0 / 0.18)',
      labelColor: active || complete ? 'oklch(90% 0.004 250)' : 'oklch(55% 0.01 250)',
    }
  }),
)
</script>

<template>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(60% 0.01 250);">
    <template v-for="s in stepMeta" :key="s.n">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <span :style="{ width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, background: s.dotBg, color: s.dotColor, border: `1px solid ${s.dotBorder}` }">{{ s.n }}</span>
          <span :style="{ color: s.labelColor }">{{ s.label }}</span>
        </div>
        <span v-if="s.showLine" :style="{ width: lineWidth, height: '1px', background: 'oklch(100% 0 0 / 0.14)', display: 'inline-block' }"></span>
      </div>
    </template>
  </div>
</template>
