<script setup lang="ts">
import { computed, ref } from 'vue'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import ContributionGridPreview from '@/components/ui/ContributionGridPreview.vue'
import { LEVEL_COLORS } from '@/helpers/grid'

type Pattern = number[][]

const HEART_MINI: Pattern = [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
]
const SMILEY_MINI: Pattern = [
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
  [1, 0, 1, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [0, 1, 0, 1, 1, 1, 1, 0, 1, 0],
  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
]
const DIAMOND_MINI: Pattern = [
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
]

function buildMiniGrid(pattern: Pattern, level: number, noise: boolean): number[] {
  const weeks = 24
  const days = 7
  const grid = new Array(weeks * days).fill(0)
  if (noise) {
    for (let i = 0; i < grid.length; i++) {
      if (Math.random() < 0.18) grid[i] = 1 + Math.floor(Math.random() * 2)
    }
  }
  const startWeek = 7
  pattern.forEach((row, r) => {
    row.forEach((filled, c) => {
      if (filled) {
        const week = startWeek + c
        const idx = week * days + r
        if (idx < grid.length) grid[idx] = level
      }
    })
  })
  return grid
}

interface DesignSpec {
  name: string
  year: string
  charity: string
  status: 'live' | 'draft' | 'archived'
  pattern: Pattern
  level: number
}

const DESIGNS: DesignSpec[] = [
  { name: 'my first design', year: '2026', charity: 'GiveDirectly', status: 'live', pattern: HEART_MINI, level: 4 },
  { name: 'holiday smiley', year: '2025', charity: 'Code.org', status: 'archived', pattern: SMILEY_MINI, level: 3 },
  { name: 'geo diamond', year: '2026', charity: 'EFF', status: 'draft', pattern: DIAMOND_MINI, level: 4 },
  { name: 'noise test', year: '2024', charity: 'Khan Academy', status: 'archived', pattern: [[]], level: 2 },
]

const RECEIPTS = [
  { charity: 'GiveDirectly', amount: 10, date: 'Jul 8, 2026' },
  { charity: 'EFF', amount: 25, date: 'Mar 2, 2026' },
  { charity: 'Code.org', amount: 15, date: 'Dec 20, 2025' },
]

const STATUS_STYLE = {
  live: { color: 'oklch(72% 0.19 145)', bg: 'oklch(58% 0.16 145 / 0.15)' },
  draft: { color: 'oklch(75% 0.14 85)', bg: 'oklch(75% 0.14 85 / 0.15)' },
  archived: { color: 'var(--color-text-muted-4)', bg: 'oklch(100% 0 0 / 0.06)' },
}

const publicOptIn = ref(true)

const designs = computed(() =>
  DESIGNS.map((d) => {
    const grid = buildMiniGrid(d.pattern, d.level, true)
    const st = STATUS_STYLE[d.status]
    return {
      name: d.name,
      year: d.year,
      charity: d.charity,
      status: d.status,
      statusColor: st.color,
      statusBg: st.bg,
      painted: grid.filter((l) => l > 0).length,
      previewCells: grid.map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })),
    }
  }),
)

const totalDonated = RECEIPTS.reduce((sum, r) => sum + r.amount, 0)

const statCards = [
  { value: '$' + totalDonated, label: 'total donated' },
  { value: String(DESIGNS.length), label: 'designs created' },
  { value: DESIGNS.filter((d) => d.status === 'live').length + ' live', label: 'on your profile now' },
  { value: '3', label: 'charities supported' },
]

const receipts = RECEIPTS
</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;">

    <AppNavbar sticky show-links>
      <template #links>
        <RouterLink to="/editor" style="color:oklch(85% 0.006 250);">design</RouterLink>
        <RouterLink to="/#community" style="color:oklch(85% 0.006 250);">community</RouterLink>
      </template>
    </AppNavbar>

    <main style="max-width:1240px;margin:0 auto;padding:clamp(28px,4vw,44px) clamp(20px,4vw,32px) 80px;">

      <!-- PAGE HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:32px;">
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:8px;">// welcome back</div>
          <h1 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(24px,2.8vw,32px);font-weight:700;margin:0;">lena.codes</h1>
        </div>
        <BaseButton as="router-link" to="/editor" style="font-size:13.5px;border-radius:8px;padding:12px 18px;text-decoration:none;">+ new design</BaseButton>
      </div>

      <!-- STATS ROW -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:36px;">
        <div v-for="s in statCards" :key="s.label" style="background:var(--color-bg-raised);border:1px solid var(--color-border);border-radius:12px;padding:18px 20px;">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:700;margin-bottom:4px;">{{ s.value }}</div>
          <div style="font-size:12.5px;color:var(--color-text-muted-4);">{{ s.label }}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 320px;gap:28px;align-items:start;">

        <!-- YOUR DESIGNS -->
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-3);letter-spacing:0.02em;margin-bottom:16px;">your designs</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div v-for="d in designs" :key="d.name" style="background:var(--color-bg-raised);border:1px solid var(--color-border);border-radius:12px;overflow:hidden;">
              <div style="padding:14px;">
                <ContributionGridPreview :cells="d.previewCells" />
              </div>
              <div style="padding:0 16px 16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;">{{ d.name }}</span>
                  <span :style="{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10.5px', fontWeight: 600, color: d.statusColor, background: d.statusBg, borderRadius: '5px', padding: '3px 8px' }">{{ d.status }}</span>
                </div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--color-text-muted-4);margin-bottom:12px;">{{ d.year }} · {{ d.painted }} squares · gave to {{ d.charity }}</div>
                <div style="display:flex;gap:8px;">
                  <BaseButton as="router-link" to="/editor" variant="secondary" style="flex:1;font-size:12px;background:oklch(15% 0.012 250);color:oklch(85% 0.006 250);border:1px solid oklch(100% 0 0 / 0.1);border-radius:6px;padding:8px;text-decoration:none;text-align:center;">edit</BaseButton>
                  <BaseButton variant="secondary" style="flex:1;font-size:12px;color:var(--color-text-muted-4);border:1px solid oklch(100% 0 0 / 0.1);border-radius:6px;padding:8px;">receipt</BaseButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SIDEBAR -->
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-3);letter-spacing:0.02em;margin-bottom:16px;">github sync</div>
          <div style="display:flex;align-items:center;gap:12px;background:var(--color-bg-raised);border:1px solid var(--color-border);border-radius:10px;padding:14px;margin-bottom:28px;">
            <div style="flex:none;width:34px;height:34px;border-radius:8px;background:oklch(58% 0.16 145 / 0.15);display:flex;align-items:center;justify-content:center;color:oklch(72% 0.19 145);font-weight:700;">✓</div>
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;">connected</div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--color-text-muted-4);">last synced 3 min ago</div>
            </div>
          </div>

          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-3);letter-spacing:0.02em;margin-bottom:16px;">default preferences</div>
          <div style="display:flex;gap:12px;align-items:center;padding:14px;border-radius:10px;background:var(--color-bg-raised);border:1px solid var(--color-border);margin-bottom:12px;">
            <div style="flex:none;width:30px;height:30px;border-radius:8px;background:var(--color-bg-chip);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--color-accent-bright);font-size:12px;">G</div>
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;font-weight:600;">GiveDirectly</div>
              <a href="#" style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;">change default</a>
            </div>
          </div>
          <div @click="publicOptIn = !publicOptIn" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:10px;background:var(--color-bg-raised);border:1px solid var(--color-border);margin-bottom:28px;">
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;font-weight:600;margin-bottom:2px;">share new designs by default</div>
            </div>
            <ToggleSwitch :checked="publicOptIn" />
          </div>

          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-3);letter-spacing:0.02em;margin-bottom:16px;">recent receipts</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div v-for="r in receipts" :key="r.charity + r.date" style="display:flex;justify-content:space-between;align-items:center;background:var(--color-bg-raised);border:1px solid var(--color-border);border-radius:9px;padding:12px 14px;">
              <div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;font-weight:600;">{{ r.charity }}</div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:oklch(58% 0.01 250);">{{ r.date }}</div>
              </div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;color:oklch(72% 0.16 145);">${{ r.amount }}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
