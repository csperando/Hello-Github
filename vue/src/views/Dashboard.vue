<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import ContributionGridPreview from '@/components/ui/ContributionGridPreview.vue'
import { LEVEL_COLORS } from '@/helpers/grid'
import { useDesignsStore } from '@/stores/designs'

const DAYS = 7

const RECEIPTS = [
  { charity: 'GiveDirectly', amount: 10, date: 'Jul 8, 2026' },
  { charity: 'EFF', amount: 25, date: 'Mar 2, 2026' },
  { charity: 'Code.org', amount: 15, date: 'Dec 20, 2025' },
]

const publicOptIn = ref(true)

const designsStore = useDesignsStore()

onMounted(() => {
  designsStore.fetchDesigns()
})

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// The schema has no status/charity fields yet, so the card shows only what
// a design actually has: its name, visibility, start date, and how much of
// it is painted. Richer dashboard metadata (charity, live/draft/archived
// status) is future work once that data exists.
const designs = computed(() =>
  designsStore.designs.map((d) => ({
    id: d.id,
    name: d.name,
    isPublic: d.is_public,
    startDateLabel: formatDate(d.start_date),
    painted: d.pattern.filter((l) => l > 0).length,
    weeks: d.pattern.length / DAYS,
    previewCells: d.pattern.map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })),
  })),
)

const totalDonated = RECEIPTS.reduce((sum, r) => sum + r.amount, 0)

const statCards = computed(() => [
  { value: '$' + totalDonated, label: 'total donated' },
  { value: String(designsStore.designs.length), label: 'designs created' },
  { value: designsStore.designs.filter((d) => d.is_public).length + ' public', label: 'on your profile now' },
  { value: '3', label: 'charities supported' },
])

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
          <div v-if="designsStore.isLoading" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-4);">loading…</div>
          <div v-else-if="designs.length === 0" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-4);">no designs yet - head to the editor to create one.</div>
          <div v-else style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div v-for="d in designs" :key="d.id" style="background:var(--color-bg-raised);border:1px solid var(--color-border);border-radius:12px;overflow:hidden;">
              <div style="padding:14px;">
                <ContributionGridPreview :cells="d.previewCells" :weeks="d.weeks" />
              </div>
              <div style="padding:0 16px 16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;">{{ d.name }}</span>
                  <span
                    :style="{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      color: d.isPublic ? 'oklch(72% 0.19 145)' : 'var(--color-text-muted-4)',
                      background: d.isPublic ? 'oklch(58% 0.16 145 / 0.15)' : 'oklch(100% 0 0 / 0.06)',
                      borderRadius: '5px',
                      padding: '3px 8px',
                    }"
                  >{{ d.isPublic ? 'public' : 'private' }}</span>
                </div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--color-text-muted-4);margin-bottom:12px;">{{ d.startDateLabel }} · {{ d.painted }} squares</div>
                <div style="display:flex;gap:8px;">
                  <BaseButton as="router-link" :to="'/editor/' + d.id" variant="secondary" style="flex:1;font-size:12px;background:oklch(15% 0.012 250);color:oklch(85% 0.006 250);border:1px solid oklch(100% 0 0 / 0.1);border-radius:6px;padding:8px;text-decoration:none;text-align:center;">edit</BaseButton>
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
