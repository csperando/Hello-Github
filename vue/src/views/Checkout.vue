<script setup lang="ts">
import { computed, ref } from 'vue'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import CharityListItem from '@/components/ui/CharityListItem.vue'
import StepProgress from '@/components/ui/StepProgress.vue'
import ContributionGridPreview from '@/components/ui/ContributionGridPreview.vue'
import { LEVEL_COLORS } from '@/helpers/grid'

interface Charity {
  name: string
  focus: string
  letter: string
}

const CHARITIES: Charity[] = [
  { name: 'GiveDirectly', focus: 'Cash transfers to families in poverty', letter: 'G' },
  { name: 'Khan Academy', focus: 'Free education for anyone, anywhere', letter: 'K' },
  { name: 'EFF', focus: 'Defending digital rights & privacy', letter: 'E' },
  { name: 'The Trevor Project', focus: 'Crisis support for LGBTQ+ youth', letter: 'T' },
  { name: 'Rainforest Trust', focus: 'Protecting critical habitats', letter: 'R' },
  { name: 'Code.org', focus: 'Computer science education for kids', letter: 'C' },
  { name: 'World Central Kitchen', focus: 'Meals in disaster & crisis zones', letter: 'W' },
  { name: 'Direct Relief', focus: 'Medical aid to under-resourced communities', letter: 'D' },
]

const HEART_MINI = [
  [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
  [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
]

function buildPreviewGrid(): number[] {
  const weeks = 24
  const days = 7
  const grid = new Array(weeks * days).fill(0)
  for (let i = 0; i < grid.length; i++) {
    if (Math.random() < 0.2) grid[i] = 1 + Math.floor(Math.random() * 2)
  }
  const startWeek = 7
  HEART_MINI.forEach((row, r) => {
    row.forEach((filled, c) => {
      if (filled) {
        const week = startWeek + c
        const idx = week * days + r
        if (idx < grid.length) grid[idx] = 3 + ((r + c) % 2)
      }
    })
  })
  return grid
}

const PRESETS = [10, 25, 50, 100]

const step = ref(1)
const search = ref('')
const selectedCharity = ref('GiveDirectly')
const amount = ref(10)
const paying = ref(false)
const previewGrid = ref<number[]>(buildPreviewGrid())
const designName = ref('my first design')

function pay() {
  paying.value = true
  setTimeout(() => {
    paying.value = false
    step.value = 3
  }, 1100)
}

const filtered = computed(() => CHARITIES.filter((c) => c.name.toLowerCase().includes(search.value.toLowerCase())))

const charities = computed(() =>
  filtered.value.map((c) => ({
    ...c,
    selected: c.name === selectedCharity.value,
    borderColor: c.name === selectedCharity.value ? 'oklch(58% 0.16 145 / 0.7)' : 'oklch(100% 0 0 / 0.08)',
  })),
)

const noResults = computed(() => filtered.value.length === 0)

const presets = computed(() =>
  PRESETS.map((value) => ({
    value,
    bg: value === amount.value ? 'oklch(58% 0.16 145)' : 'oklch(15% 0.012 250)',
    color: value === amount.value ? 'oklch(14% 0.03 145)' : 'oklch(85% 0.006 250)',
    border: value === amount.value ? 'transparent' : 'oklch(100% 0 0 / 0.1)',
  })),
)

const donationAmount = computed(() => Math.max(0, amount.value - 3))
const previewCells = computed(() => previewGrid.value.map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })))
const paintedCount = computed(() => previewGrid.value.filter((l) => l > 0).length)
</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;">

    <AppNavbar sticky show-links />

    <main style="max-width:1140px;margin:0 auto;padding:clamp(28px,4vw,48px) clamp(20px,4vw,32px) 80px;">

      <StepProgress :steps="['charity', 'payment', 'done']" :current="step" line-width="32px" />

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] items-start gap-8">

        <!-- STEP CONTENT -->
        <BaseCard padding="clamp(24px,3vw,36px)" style="min-width:0;">

          <!-- STEP 1: CHARITY -->
          <div v-if="step === 1">
            <h1 style="font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:700;margin:0 0 6px;">Choose a charity</h1>
            <p style="font-size:14px;color:oklch(68% 0.008 250);margin:0 0 22px;">100% of your contribution beyond the flat fee goes here.</p>

            <input v-model="search" placeholder="search 501(c)(3) organizations…" style="width:100%;box-sizing:border-box;font-family:'IBM Plex Sans',sans-serif;font-size:14px;background:oklch(15% 0.012 250);color:oklch(96% 0.004 250);border:1px solid oklch(100% 0 0 / 0.12);border-radius:8px;padding:12px 14px;margin-bottom:20px;" />

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5" style="margin-bottom:24px;">
              <CharityListItem
                v-for="charity in charities"
                :key="charity.name"
                size="md"
                :name="charity.name"
                :letter="charity.letter"
                :focus="charity.focus"
                :border-color="charity.borderColor"
                :selected="charity.selected"
                @click="selectedCharity = charity.name"
              />
            </div>
            <div v-if="noResults" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(60% 0.01 250);margin-bottom:24px;">no matches — you can enter an EIN or org name at payment time instead.</div>

            <div style="display:flex;justify-content:flex-end;">
              <BaseButton @click="step = 2" style="font-size:14px;border-radius:8px;padding:13px 22px;">continue →</BaseButton>
            </div>
          </div>

          <!-- STEP 2: AMOUNT + PAYMENT -->
          <div v-else-if="step === 2">
            <h1 style="font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:700;margin:0 0 6px;">Set your contribution</h1>
            <p style="font-size:14px;color:oklch(68% 0.008 250);margin:0 0 24px;">Giving to <span style="color:oklch(72% 0.16 145);">{{ selectedCharity }}</span>.</p>

            <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
              <button
                v-for="preset in presets"
                :key="preset.value"
                @click="amount = preset.value"
                :style="{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, fontSize: '13.5px', background: preset.bg, color: preset.color, border: `1px solid ${preset.border}`, borderRadius: '8px', padding: '10px 16px', cursor: 'pointer' }"
              >${{ preset.value }}</button>
            </div>

            <div style="font-family:'IBM Plex Mono',monospace;font-size:38px;font-weight:700;margin-bottom:12px;">${{ amount }}</div>
            <input type="range" min="3" max="150" step="1" v-model.number="amount" style="width:100%;margin-bottom:22px;" />

            <div style="background:oklch(15% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);border-radius:10px;padding:16px;margin-bottom:26px;">
              <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:13px;margin-bottom:8px;"><span style="color:oklch(65% 0.01 250);">flat fee (covers costs)</span><span>$3</span></div>
              <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:13px;"><span style="color:oklch(65% 0.01 250);">goes to {{ selectedCharity }}</span><span style="color:oklch(72% 0.16 145);font-weight:600;">${{ donationAmount }}</span></div>
            </div>

            <label style="display:block;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(70% 0.01 250);margin-bottom:7px;">card number</label>
            <input value="4242 4242 4242 4242" readonly style="width:100%;box-sizing:border-box;font-family:'IBM Plex Mono',monospace;font-size:13.5px;background:oklch(15% 0.012 250);color:oklch(96% 0.004 250);border:1px solid oklch(100% 0 0 / 0.12);border-radius:8px;padding:12px 14px;margin-bottom:14px;" />
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:26px;">
              <input value="08 / 28" readonly style="width:100%;box-sizing:border-box;font-family:'IBM Plex Mono',monospace;font-size:13.5px;background:oklch(15% 0.012 250);color:oklch(96% 0.004 250);border:1px solid oklch(100% 0 0 / 0.12);border-radius:8px;padding:12px 14px;" />
              <input value="•••" readonly style="width:100%;box-sizing:border-box;font-family:'IBM Plex Mono',monospace;font-size:13.5px;background:oklch(15% 0.012 250);color:oklch(96% 0.004 250);border:1px solid oklch(100% 0 0 / 0.12);border-radius:8px;padding:12px 14px;" />
            </div>

            <div style="display:flex;justify-content:space-between;">
              <BaseButton variant="secondary" @click="step = 1" style="font-weight:500;font-size:14px;color:oklch(80% 0.006 250);border:1px solid oklch(100% 0 0 / 0.16);border-radius:8px;padding:13px 18px;">back</BaseButton>
              <BaseButton
                @click="pay"
                :disabled="paying"
                :loading="paying"
                style="display:flex;align-items:center;gap:9px;font-size:14px;border-radius:8px;padding:13px 22px;"
              >
                <span v-if="paying">processing…</span>
                <span v-else>commit & donate ${{ amount }} →</span>
              </BaseButton>
            </div>
          </div>

          <!-- STEP 3: RECEIPT -->
          <div v-else style="text-align:center;padding:12px 0 4px;">
            <div style="width:56px;height:56px;border-radius:50%;background:oklch(58% 0.16 145 / 0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:24px;color:oklch(72% 0.19 145);">✓</span>
            </div>
            <h1 style="font-family:'IBM Plex Mono',monospace;font-size:21px;font-weight:700;margin:0 0 8px;">Commit pushed. Donation sent.</h1>
            <p style="font-size:14px;line-height:1.6;color:oklch(70% 0.008 250);max-width:400px;margin:0 auto 28px;">Your design is on its way to your GitHub profile — it can take a few minutes to appear.</p>

            <div style="text-align:left;background:oklch(15% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);border-radius:10px;padding:18px 20px;margin-bottom:24px;">
              <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:13px;margin-bottom:10px;"><span style="color:oklch(65% 0.01 250);">design</span><span style="font-weight:600;">{{ designName }}</span></div>
              <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:13px;margin-bottom:10px;"><span style="color:oklch(65% 0.01 250);">charity</span><span style="font-weight:600;">{{ selectedCharity }}</span></div>
              <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:13px;"><span style="color:oklch(65% 0.01 250);">total charged</span><span style="font-weight:600;color:oklch(72% 0.16 145);">${{ amount }}</span></div>
            </div>

            <div style="display:flex;gap:12px;">
              <BaseButton variant="secondary" style="flex:1;font-weight:500;font-size:14px;color:oklch(80% 0.006 250);border:1px solid oklch(100% 0 0 / 0.16);border-radius:8px;padding:13px 18px;">download receipt</BaseButton>
              <BaseButton style="flex:1;font-size:14px;border-radius:8px;padding:13px 18px;">view on github →</BaseButton>
            </div>
          </div>

        </BaseCard>

        <!-- ORDER SUMMARY -->
        <aside class="lg:sticky lg:top-24">
          <BaseCard padding="22px">
            <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);letter-spacing:0.04em;margin-bottom:12px;">your design</div>
            <div style="background:oklch(15% 0.012 250);border-radius:8px;padding:12px;margin-bottom:16px;">
              <ContributionGridPreview :cells="previewCells" />
            </div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;margin-bottom:4px;">{{ designName }}</div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(60% 0.01 250);margin-bottom:20px;">{{ paintedCount }} squares · 2026</div>

            <div style="border-top:1px solid oklch(100% 0 0 / 0.08);padding-top:16px;">
              <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(60% 0.01 250);margin-bottom:8px;"><span>charity</span><span style="color:oklch(90% 0.004 250);">{{ selectedCharity }}</span></div>
              <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(60% 0.01 250);"><span>total</span><span style="color:oklch(90% 0.004 250);font-weight:600;">${{ amount }}</span></div>
            </div>
          </BaseCard>
        </aside>
      </div>
    </main>
  </div>
</template>
