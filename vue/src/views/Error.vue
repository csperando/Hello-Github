<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import ContributionGridPreview from '@/components/ui/ContributionGridPreview.vue'
import { LEVEL_COLORS } from '@/helpers/grid'

type ErrorTypeKey = '404' | '500' | 'github_disconnected'

const props = withDefaults(
  defineProps<{
    errorType?: ErrorTypeKey
  }>(),
  {
    errorType: '404',
  },
)

const RED_LEVEL_COLORS = [
  'oklch(24% 0.01 250)',
  'oklch(35% 0.1 25)',
  'oklch(45% 0.15 25)',
  'oklch(55% 0.19 25)',
  'oklch(65% 0.2 25)',
]

type Pattern = number[][]

const QUESTION_MARK: Pattern = [
  [0, 1, 1, 1, 0],
  [1, 0, 0, 1, 1],
  [0, 0, 1, 1, 0],
  [0, 1, 1, 0, 0],
  [0, 1, 1, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0],
]

const EXCLAIM: Pattern = [
  [0, 1, 1, 0],
  [0, 1, 1, 0],
  [0, 1, 1, 0],
  [0, 1, 1, 0],
  [0, 1, 1, 0],
  [0, 0, 0, 0],
  [0, 1, 1, 0],
]

interface ErrorSpec {
  eyebrow: string
  code: string
  codeColor: string
  title: string
  message: string
  primaryAction: string
  showDetails: boolean
  errorDetails?: string
  pattern: Pattern
  level: number
  startWeek: number
  noiseChance: number
  colors: string[]
}

const ERROR_TYPES: Record<ErrorTypeKey, ErrorSpec> = {
  '404': {
    eyebrow: 'page not found',
    code: '404',
    codeColor: 'oklch(72% 0.16 145)',
    title: "This grid square doesn't exist.",
    message: "The page you're looking for was moved, deleted, or never committed in the first place.",
    primaryAction: 'browse designs →',
    showDetails: false,
    pattern: QUESTION_MARK,
    level: 4,
    startWeek: 11,
    noiseChance: 0.16,
    colors: LEVEL_COLORS,
  },
  '500': {
    eyebrow: 'server error',
    code: '500',
    codeColor: 'oklch(65% 0.2 25)',
    title: 'Something broke on our end.',
    message: 'Our servers hit a snag pushing your commits. Your design and payment are safe — try again in a moment.',
    primaryAction: 'try again',
    showDetails: true,
    errorDetails: 'Error 500: internal_server_error\nRequest ID: req_8f21c9a\nTimestamp: 2026-07-10T14:22:01Z',
    pattern: EXCLAIM,
    level: 4,
    startWeek: 12,
    noiseChance: 0.22,
    colors: RED_LEVEL_COLORS,
  },
  github_disconnected: {
    eyebrow: 'connection lost',
    code: '502',
    codeColor: 'oklch(75% 0.14 85)',
    title: 'Lost connection to GitHub.',
    message: "We couldn't reach GitHub to push your commits. Reconnect your account and we'll pick up right where you left off.",
    primaryAction: 'reconnect github →',
    showDetails: false,
    pattern: EXCLAIM,
    level: 3,
    startWeek: 12,
    noiseChance: 0.14,
    colors: LEVEL_COLORS,
  },
}

function buildGlitchGrid(spec: ErrorSpec): { bg: string }[] {
  const weeks = 28
  const days = 7
  const grid = new Array(weeks * days).fill(0)
  for (let i = 0; i < grid.length; i++) {
    if (Math.random() < spec.noiseChance) grid[i] = 1 + Math.floor(Math.random() * (spec.colors.length - 2))
  }
  spec.pattern.forEach((row, r) => {
    row.forEach((filled, c) => {
      if (filled) {
        const week = spec.startWeek + c
        const idx = week * days + r
        if (idx >= 0 && idx < grid.length) grid[idx] = spec.level
      }
    })
  })
  return grid.map((l) => ({ bg: spec.colors[l] ?? spec.colors[0]! }))
}

const type = computed(() => ERROR_TYPES[props.errorType] ?? ERROR_TYPES['404'])
const glitchCells = ref<{ bg: string }[]>(buildGlitchGrid(type.value))

function regenerate() {
  glitchCells.value = buildGlitchGrid(type.value)
}

watch(type, regenerate)

const router = useRouter()

function onPrimaryAction() {
  if (props.errorType === '404') {
    router.push('/dashboard')
  } else if (props.errorType === 'github_disconnected') {
    router.push('/signup')
  } else {
    regenerate()
  }
}
</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;display:flex;flex-direction:column;">

    <AppNavbar sticky show-links>
      <template #links>
        <RouterLink to="/editor" style="color:oklch(85% 0.006 250);">design</RouterLink>
        <RouterLink to="/#community" style="color:oklch(85% 0.006 250);">community</RouterLink>
      </template>
    </AppNavbar>

    <!-- MAIN -->
    <main style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px clamp(20px,4vw,48px) 80px;background-image:radial-gradient(oklch(100% 0 0 / 0.045) 1px, transparent 1px);background-size:22px 22px;">
      <div style="width:100%;max-width:640px;text-align:center;">

        <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:22px;">// {{ type.eyebrow }}</div>

        <div :style="{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 'clamp(64px,10vw,110px)', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '8px', animation: 'flicker 4s ease-in-out infinite', color: type.codeColor }">{{ type.code }}</div>

        <h1 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(20px,2.6vw,26px);font-weight:600;margin:0 0 14px;">{{ type.title }}</h1>
        <p style="font-size:15px;line-height:1.65;color:oklch(72% 0.008 250);max-width:460px;margin:0 auto 34px;">{{ type.message }}</p>

        <!-- CONTRIBUTION GRID GLITCH ART -->
        <BaseCard padding="22px 20px" style="margin:0 auto 34px;max-width:460px;">
          <ContributionGridPreview :cells="glitchCells" :weeks="28" />
        </BaseCard>

        <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
          <BaseButton @click="onPrimaryAction" style="font-size:14px;border-radius:8px;padding:13px 22px;">{{ type.primaryAction }}</BaseButton>
          <BaseButton as="router-link" to="/" variant="secondary" style="font-weight:500;font-size:14px;color:oklch(94% 0.004 250);border:1px solid oklch(100% 0 0 / 0.18);border-radius:8px;padding:13px 22px;text-decoration:none;">back home</BaseButton>
        </div>

        <div v-if="type.showDetails" style="margin-top:32px;text-align:left;background:oklch(17% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);border-radius:10px;padding:16px 18px;">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:oklch(58% 0.01 250);margin-bottom:8px;">error details</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(70% 0.008 250);line-height:1.6;white-space:pre-wrap;">{{ type.errorDetails }}</div>
        </div>

        <div style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(50% 0.01 250);margin-top:28px;">still stuck? <a href="#">contact support</a></div>
      </div>
    </main>
  </div>
</template>
