<script setup lang="ts">
import { computed, ref } from 'vue'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { LEVEL_COLORS, todayAnchor, currentYearAnchor } from '@/helpers/grid'

const WEEKS = 53
const DAYS = 7 // row 0 = Sunday, matching stampPattern's idx = week * DAYS + row and GitHub's own week layout
const MONTH_LABELS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

type Pattern = number[][]

function emptyGrid(): number[] {
  return new Array(WEEKS * DAYS).fill(0)
}

function stampPattern(pattern: Pattern, startWeek: number, level: number): number[] {
  const grid = emptyGrid()
  pattern.forEach((row, r) => {
    row.forEach((filled, c) => {
      if (filled) {
        const week = startWeek + c
        const idx = week * DAYS + r
        if (idx >= 0 && idx < grid.length) grid[idx] = level
      }
    })
  })
  return grid
}

const HEART: Pattern = [
  [0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
  [1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0],
  [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
]
const SMILEY: Pattern = [
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
  [1, 0, 1, 0, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [0, 1, 0, 1, 1, 1, 1, 0, 1, 0],
  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
]
const DIAMOND: Pattern = [
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
]

const TEMPLATES = [
  { key: 'blank', name: 'Blank canvas', icon: '▢', build: () => emptyGrid() },
  { key: 'heart', name: 'Heart', icon: '♥', build: () => stampPattern(HEART, 19, 4) },
  { key: 'smiley', name: 'Smiley', icon: '☺', build: () => stampPattern(SMILEY, 21, 3) },
  { key: 'diamond', name: 'Diamond', icon: '◆', build: () => stampPattern(DIAMOND, 20, 4) },
]

type TabKey = 'year' | 'today'
const currentYear = new Date().getFullYear()

const grid = ref<number[]>(stampPattern(HEART, 19, 4))
const selectedTemplate = ref('heart')
const brush = ref(4)
const painting = ref(false)
const activeTab = ref<TabKey>('today')
const publicOptIn = ref(true)
const designName = ref('my first design')
const repeatIndefinitely = ref(false)

function paintCell(idx: number, forceLevel?: number) {
  const current = grid.value[idx] ?? 0
  grid.value[idx] = forceLevel !== undefined ? forceLevel : current === brush.value ? 0 : brush.value
}

function onCellDown(idx: number) {
  painting.value = true
  paintCell(idx)
}

function onCellEnter(idx: number) {
  if (painting.value) paintCell(idx, brush.value)
}

function onClear() {
  grid.value = emptyGrid()
  selectedTemplate.value = 'blank'
}

function onRandomize() {
  grid.value = emptyGrid().map(() => (Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 4) : 0))
  selectedTemplate.value = 'blank'
}

function applyTemplate(key: string) {
  const tpl = TEMPLATES.find((t) => t.key === key)
  if (!tpl) return
  grid.value = tpl.build()
  selectedTemplate.value = key
}

// The grid's first column is always the most recent Sunday on/before this
// anchor date - "today" gives a rolling window starting now, "year" starts
// from Jan 1 of the current year for year-to-date designs. Both tabs use the
// same fixed 53-week grid width, extending forward from the anchor (this app
// designs future contributions, unlike GitHub's own profile graph which runs
// backward from today).
const anchorDate = computed(() => (activeTab.value === 'today' ? todayAnchor() : currentYearAnchor()))
const anchorDateLabel = computed(() =>
  anchorDate.value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
)

function selectTab(key: TabKey) {
  if (key === activeTab.value) return
  activeTab.value = key
  // Switching tabs re-bases the grid onto a different real-world date range,
  // so painted cells can't be meaningfully remapped onto new columns - reset
  // the canvas rather than leaving stale art anchored to the wrong dates.
  grid.value = emptyGrid()
  selectedTemplate.value = 'blank'
}

const cells = computed(() =>
  grid.value.map((level, idx) => ({ idx, bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })),
)

const months = computed(() =>
  MONTH_LABELS.map((label, i) => ({ label, col: Math.round((i * WEEKS) / 12) + 1 })),
)

const templates = computed(() =>
  TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    icon: t.icon,
    bg: t.key === selectedTemplate.value ? 'oklch(58% 0.16 145 / 0.12)' : 'transparent',
    border: t.key === selectedTemplate.value ? 'oklch(58% 0.16 145 / 0.5)' : 'oklch(100% 0 0 / 0.08)',
  })),
)

const brushLevels = computed(() =>
  LEVEL_COLORS.map((color, lvl) => ({
    lvl,
    bg: color,
    border: lvl === brush.value ? 'oklch(96% 0.004 250)' : 'transparent',
  })),
)

const TABS: { key: TabKey; label: string }[] = [
  { key: 'year', label: String(currentYear) },
  { key: 'today', label: 'Today' },
]

const tabs = computed(() =>
  TABS.map((t) => ({
    ...t,
    bg: t.key === activeTab.value ? 'oklch(58% 0.16 145)' : 'transparent',
    color: t.key === activeTab.value ? 'oklch(14% 0.03 145)' : 'oklch(75% 0.008 250)',
  })),
)

const activeTabLabel = computed(() => TABS.find((t) => t.key === activeTab.value)?.label ?? 'Today')

const painted = computed(() => grid.value.filter((l) => l > 0).length)
const commitCount = computed(() => painted.value * brush.value * 2)
</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;display:flex;flex-direction:column;">

    <AppNavbar sticky show-links>
      <template #links>
        <RouterLink to="/#how" style="color:oklch(85% 0.006 250);">how it works</RouterLink>
        <RouterLink to="/#give" style="color:oklch(85% 0.006 250);">pricing</RouterLink>
        <RouterLink to="/#community" style="color:oklch(85% 0.006 250);">community</RouterLink>
      </template>
    </AppNavbar>

    <!-- EDITOR SUB-BAR -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px clamp(16px,3vw,32px);border-bottom:1px solid oklch(100% 0 0 / 0.08);flex-wrap:wrap;gap:12px;">
      <div style="display:flex;align-items:center;gap:10px;font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(65% 0.01 250);">
        <span>editor</span>
        <span style="width:1px;height:14px;background:oklch(100% 0 0 / 0.12);"></span>
        <span style="color:oklch(85% 0.006 250);">saved as draft</span>
      </div>

      <div style="display:flex;align-items:center;gap:4px;background:oklch(19% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);border-radius:8px;padding:3px;">
        <button
          v-for="t in tabs"
          :key="t.key"
          @click="selectTab(t.key)"
          :style="{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12.5px', fontWeight: 600, background: t.bg, color: t.color, border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer' }"
        >{{ t.label }}</button>
      </div>

      <BaseButton as="router-link" to="/checkout" style="font-size:13.5px;border-radius:7px;padding:10px 18px;text-decoration:none;">continue to checkout →</BaseButton>
    </div>

    <!-- BODY -->
    <div style="flex:1;display:grid;grid-template-columns:236px 1fr 268px;min-height:0;">

      <!-- LEFT SIDEBAR: TEMPLATES + BRUSH -->
      <aside style="border-right:1px solid oklch(100% 0 0 / 0.08);padding:22px 18px;overflow-y:auto;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin-bottom:12px;">templates</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:28px;">
          <div
            v-for="tpl in templates"
            :key="tpl.key"
            @click="applyTemplate(tpl.key)"
            :style="{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', background: tpl.bg, border: `1px solid ${tpl.border}` }"
          >
            <div style="flex:none;width:26px;height:26px;border-radius:6px;background:oklch(24% 0.02 250);display:flex;align-items:center;justify-content:center;font-size:13px;">{{ tpl.icon }}</div>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;">{{ tpl.name }}</span>
          </div>
        </div>

        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin-bottom:12px;">brush intensity</div>
        <div style="display:flex;gap:8px;margin-bottom:24px;">
          <div
            v-for="lvl in brushLevels"
            :key="lvl.lvl"
            @click="brush = lvl.lvl"
            :style="{ width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', background: lvl.bg, border: `2px solid ${lvl.border}` }"
          ></div>
        </div>

        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin-bottom:12px;">actions</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <BaseButton variant="secondary" @click="onClear" style="font-size:12.5px;background:oklch(19% 0.012 250);color:oklch(80% 0.006 250);border:1px solid oklch(100% 0 0 / 0.1);border-radius:7px;padding:9px 12px;text-align:left;">clear grid</BaseButton>
          <BaseButton variant="secondary" @click="onRandomize" style="font-size:12.5px;background:oklch(19% 0.012 250);color:oklch(80% 0.006 250);border:1px solid oklch(100% 0 0 / 0.1);border-radius:7px;padding:9px 12px;text-align:left;">randomize noise</BaseButton>
        </div>
      </aside>

      <!-- CENTER: CANVAS -->
      <main style="padding:clamp(20px,3vw,44px);overflow:auto;display:flex;align-items:center;justify-content:center;">
        <div style="width:100%;max-width:980px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:20px;">
            <div style="font-family:'IBM Plex Mono',monospace;font-size:14px;color:oklch(85% 0.006 250);">{{ activeTabLabel }} contribution graph · starts {{ anchorDateLabel }}</div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(60% 0.01 250);">drag to paint · click to toggle</div>
          </div>
          <BaseCard padding="28px 26px 24px">
            <div style="display:grid;grid-template-columns:repeat(53, 1fr);gap:clamp(2px,0.35vw,4px);margin-bottom:8px;padding-left:32px;">
              <span
                v-for="m in months"
                :key="m.label"
                :style="{ gridColumn: m.col + ' / span 4', font: '500 10.5px IBM Plex Mono, monospace', color: 'oklch(58% 0.01 250)' }"
              >{{ m.label }}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:stretch;">
              <div style="flex:none;width:26px;display:grid;grid-template-rows:repeat(7, 1fr);align-items:center;padding:2px 0;">
                <span style="grid-row:2;font:500 10px 'IBM Plex Mono',monospace;color:oklch(58% 0.01 250);">mon</span>
                <span style="grid-row:4;font:500 10px 'IBM Plex Mono',monospace;color:oklch(58% 0.01 250);">wed</span>
                <span style="grid-row:6;font:500 10px 'IBM Plex Mono',monospace;color:oklch(58% 0.01 250);">fri</span>
              </div>
              <div
                @mousedown="painting = true"
                @mouseup="painting = false"
                @mouseleave="painting = false"
                style="flex:1;min-width:0;display:grid;grid-template-columns:repeat(53, 1fr);grid-template-rows:repeat(7, 1fr);grid-auto-flow:column;gap:clamp(2px,0.35vw,4px);aspect-ratio:53/7.6;user-select:none;"
              >
                <div
                  v-for="cell in cells"
                  :key="cell.idx"
                  @mousedown="onCellDown(cell.idx)"
                  @mouseenter="onCellEnter(cell.idx)"
                  :style="{ borderRadius: '2px', cursor: 'pointer', background: cell.bg }"
                ></div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:18px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(58% 0.01 250);">
              <span>less</span>
              <span style="width:11px;height:11px;border-radius:2px;background:oklch(24% 0.01 250);display:inline-block;"></span>
              <span style="width:11px;height:11px;border-radius:2px;background:oklch(32% 0.07 145);display:inline-block;"></span>
              <span style="width:11px;height:11px;border-radius:2px;background:oklch(45% 0.12 145);display:inline-block;"></span>
              <span style="width:11px;height:11px;border-radius:2px;background:oklch(58% 0.16 145);display:inline-block;"></span>
              <span style="width:11px;height:11px;border-radius:2px;background:oklch(72% 0.19 145);display:inline-block;"></span>
              <span>more</span>
            </div>
          </BaseCard>
        </div>
      </main>

      <!-- RIGHT SIDEBAR: STATS + CHARITY PREVIEW -->
      <aside style="border-left:1px solid oklch(100% 0 0 / 0.08);padding:22px 20px;overflow-y:auto;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin-bottom:10px;">design name</div>
        <input v-model="designName" placeholder="untitled design" style="width:100%;box-sizing:border-box;font-family:'IBM Plex Mono',monospace;font-size:13px;background:oklch(19% 0.012 250);color:oklch(96% 0.004 250);border:1px solid oklch(100% 0 0 / 0.1);border-radius:8px;padding:10px 12px;margin-bottom:24px;" />

        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin-bottom:14px;">design stats</div>
        <div style="background:oklch(19% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);border-radius:10px;padding:16px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:13px;margin-bottom:10px;"><span style="color:oklch(65% 0.01 250);">squares painted</span><span style="font-weight:600;">{{ painted }} / {{ grid.length }}</span></div>
          <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:13px;"><span style="color:oklch(65% 0.01 250);">estimated commits</span><span style="font-weight:600;">{{ commitCount }}</span></div>
        </div>

        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin-bottom:14px;">supporting</div>
        <div style="display:flex;gap:12px;align-items:center;padding:14px;border-radius:10px;background:oklch(19% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);margin-bottom:24px;">
          <div style="flex:none;width:34px;height:34px;border-radius:8px;background:oklch(24% 0.02 250);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;color:oklch(72% 0.16 145);">G</div>
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;">GiveDirectly</div>
            <a href="#" style="font-family:'IBM Plex Mono',monospace;font-size:12px;">change charity</a>
          </div>
        </div>

        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin-bottom:14px;">visibility</div>
        <div @click="publicOptIn = !publicOptIn" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:10px;background:oklch(19% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);">
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;margin-bottom:2px;">share to gallery</div>
            <div style="font-size:11.5px;color:oklch(60% 0.008 250);">visible to community</div>
          </div>
          <ToggleSwitch :checked="publicOptIn" />
        </div>

        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin:24px 0 14px;">recurrence</div>
        <div @click="repeatIndefinitely = !repeatIndefinitely" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:10px;background:oklch(19% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);">
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;margin-bottom:2px;">repeat every year</div>
            <div style="font-size:11.5px;color:oklch(60% 0.008 250);">auto-repaints this design indefinitely on future years</div>
          </div>
          <ToggleSwitch :checked="repeatIndefinitely" />
        </div>
        <div v-if="repeatIndefinitely" style="display:flex;align-items:center;gap:6px;margin-top:10px;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:oklch(72% 0.16 145);">
          <span>∞</span><span>renews from {{ activeTabLabel }} → forever, until you cancel</span>
        </div>
      </aside>
    </div>
  </div>
</template>
