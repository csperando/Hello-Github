<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import ContributionGridPreview from '@/components/ui/ContributionGridPreview.vue'
import { LEVEL_COLORS } from '@/helpers/grid'
import { useDesignsStore } from '@/stores/designs'
import { useAuthStore } from '@/stores/auth'
import { updateProfile } from '@/services/api'

const DAYS = 7

const designsStore = useDesignsStore()
// authStore.user is already populated here: the router's requiresAuth guard
// (vue/src/router/index.ts) awaits fetchMe() before this route resolves.
const authStore = useAuthStore()

onMounted(() => {
  designsStore.fetchSelections()
})

const activeToggleError = ref('')

/**
 * Toggles is_active on the caller's own selection - the backend enforces at
 * most one active selection per user, so this can be rejected (e.g.
 * activating a second design while another is already active); on that
 * conflict the optimistic flip is rolled back and the server's message shown.
 */
async function toggleActive(designId: string) {
  activeToggleError.value = ''
  const row = designsStore.selections.find((s) => s.design_id === designId)
  if (!row) return

  const next = !row.is_active
  const previous = row.is_active
  row.is_active = next

  const result = await designsStore.setActive(designId, next)
  if (!result.ok) {
    row.is_active = previous
    activeToggleError.value = result.error
  }
}

const displayName = computed(
  () => authStore.user?.display_name || authStore.user?.name || authStore.user?.github_username || '',
)

const defaultCharityLabel = computed(() => authStore.user?.default_charity || 'no charity selected')
const defaultCharityLetter = computed(() => (authStore.user?.default_charity?.charAt(0) || '–').toUpperCase())

async function togglePublicOptIn() {
  const user = authStore.user
  if (!user) return

  const next = !user.public_opt_in
  user.public_opt_in = next

  const res = await updateProfile(user.id, { public_opt_in: next })
  if (!res.ok) {
    user.public_opt_in = !next
  }
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Lists both authored and adopted designs (the pivot table joins a
// selection with whatever design content it points at). A design the
// viewer didn't author and that's since gone private shows as "no longer
// available" instead of its real content - their selection itself is
// untouched/still scheduled, this only affects what's displayed here.
const designs = computed(() =>
  designsStore.selections.map((s) => {
    const isAuthor = s.design_owner_id === authStore.user?.id
    const available = isAuthor || s.is_public
    return {
      id: s.design_id,
      name: available ? s.name : 'no longer available',
      isPublic: s.is_public,
      isActive: s.is_active,
      available,
      startDateLabel: formatDate(s.start_date),
      painted: available ? s.pattern.filter((l) => l > 0).length : 0,
      weeks: available ? s.pattern.length / DAYS : 0,
      previewCells: available ? s.pattern.map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })) : [],
    }
  }),
)

// Donation totals, charity counts, and receipts have no backing data model
// yet (no donations/receipts table) - only design-derived stats are real.
// Scoped to designs the user actually authored, not ones they've adopted
// from someone else, matching what these labels mean.
const authoredSelections = computed(() =>
  designsStore.selections.filter((s) => s.design_owner_id === authStore.user?.id),
)
const statCards = computed(() => [
  { value: String(authoredSelections.value.length), label: 'designs created' },
  { value: authoredSelections.value.filter((s) => s.is_public).length + ' public', label: 'on your profile now' },
])
</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;">

    <AppNavbar sticky show-links />

    <main style="max-width:1240px;margin:0 auto;padding:clamp(28px,4vw,44px) clamp(20px,4vw,32px) 80px;">

      <!-- PAGE HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:32px;">
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:8px;">// welcome back</div>
          <h1 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(24px,2.8vw,32px);font-weight:700;margin:0;">{{ displayName }}</h1>
        </div>
        <BaseButton as="router-link" to="/editor" style="font-size:13.5px;border-radius:8px;padding:12px 18px;text-decoration:none;">+ new design</BaseButton>
      </div>

      <!-- STATS ROW -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4" style="margin-bottom:36px;">
        <div v-for="s in statCards" :key="s.label" style="background:var(--color-bg-raised);border:1px solid var(--color-border);border-radius:12px;padding:18px 20px;">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:700;margin-bottom:4px;">{{ s.value }}</div>
          <div style="font-size:12.5px;color:var(--color-text-muted-4);">{{ s.label }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] items-start gap-7">

        <!-- YOUR DESIGNS -->
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-3);letter-spacing:0.02em;margin-bottom:16px;">your designs</div>
          <div v-if="activeToggleError" style="font-size:13px;color:oklch(70% 0.19 25);margin-bottom:16px;">{{ activeToggleError }}</div>
          <div v-if="designsStore.isLoading" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-4);">loading…</div>
          <div v-else-if="designs.length === 0" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-4);">no designs yet - head to the editor to create one.</div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-for="d in designs" :key="d.id" style="background:var(--color-bg-raised);border:1px solid var(--color-border);border-radius:12px;overflow:hidden;">
              <div v-if="d.available" style="padding:14px;">
                <ContributionGridPreview :cells="d.previewCells" :weeks="d.weeks" height="90px" />
              </div>
              <div v-else style="padding:14px;height:90px;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--color-text-muted-4);">preview unavailable</div>
              <div style="padding:0 16px 16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;">{{ d.name }}</span>
                  <span
                    v-if="d.available"
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
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid oklch(100% 0 0 / 0.06);margin-bottom:8px;">
                  <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--color-text-muted-4);">active</span>
                  <ToggleSwitch :data-testid="'active-toggle-' + d.id" :checked="d.isActive" @click="toggleActive(d.id)" />
                </div>
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
            </div>
          </div>

          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-3);letter-spacing:0.02em;margin-bottom:16px;">default preferences</div>
          <div style="display:flex;gap:12px;align-items:center;padding:14px;border-radius:10px;background:var(--color-bg-raised);border:1px solid var(--color-border);margin-bottom:12px;">
            <div style="flex:none;width:30px;height:30px;border-radius:8px;background:var(--color-bg-chip);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--color-accent-bright);font-size:12px;">{{ defaultCharityLetter }}</div>
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;font-weight:600;">{{ defaultCharityLabel }}</div>
              <a href="#" style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;">change default</a>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:10px;background:var(--color-bg-raised);border:1px solid var(--color-border);margin-bottom:28px;">
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;font-weight:600;margin-bottom:2px;">share new designs by default</div>
            </div>
            <ToggleSwitch data-testid="public-opt-in-toggle" :checked="!!authStore.user?.public_opt_in" @click="togglePublicOptIn" />
          </div>

          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-3);letter-spacing:0.02em;margin-bottom:16px;">recent receipts</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--color-text-muted-4);">no receipts yet - they'll show up here once you make a donation.</div>
        </div>
      </div>
    </main>
  </div>
</template>
