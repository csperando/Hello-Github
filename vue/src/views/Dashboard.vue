<script setup lang="ts">
    import { computed, onMounted, ref } from "vue"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import ContributionGridPreview from "@/components/ui/ContributionGridPreview.vue"
    import { LEVEL_COLORS } from "@/helpers/grid"
    import { useDesignsStore } from "@/stores/designs"
    import { useAuthStore } from "@/stores/auth"
    import { updateProfile } from "@/services/api"

    const DAYS = 7

    const designsStore = useDesignsStore()
    // authStore.user is already populated here: the router's requiresAuth guard
    // (vue/src/router/index.ts) awaits fetchMe() before this route resolves.
    const authStore = useAuthStore()

    onMounted(() => {
        designsStore.fetchSelections()
        designsStore.fetchRunStatuses()
    })

    /** "last painted 2 hours ago" / "last painted 3 days ago" / "last attempt failed" - optional/separable display, not required for anything else to work. */
    function formatRunStatusLabel(designId: string): string | null {
        const status = designsStore.runStatuses[designId]
        if (!status) return null
        if (status.status === "failed") return "last attempt failed"

        const when = new Date(status.created_at)
        const diffHours = Math.round((Date.now() - when.getTime()) / (1000 * 60 * 60))
        if (diffHours < 1) return "last painted just now"
        if (diffHours < 24) return `last painted ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
        const diffDays = Math.round(diffHours / 24)
        return `last painted ${diffDays} day${diffDays === 1 ? "" : "s"} ago`
    }

    const activeToggleError = ref("")

    /**
     * Toggles is_active on the caller's own selection - the backend enforces at
     * most one active selection per user, so this can be rejected (e.g.
     * activating a second design while another is already active); on that
     * conflict the optimistic flip is rolled back and the server's message shown.
     */
    async function toggleActive(designId: string) {
        activeToggleError.value = ""
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
        () => authStore.user?.display_name || authStore.user?.name || authStore.user?.github_username || "",
    )

    // default_charity is now an eo_bmf id, not a name - the auth payload doesn't
    // carry a display name for it yet (that needs a backend join, tracked
    // separately alongside migrating this picker to real charity search), so
    // this can only say whether one is set, not which one.
    const defaultCharityLabel = computed(() => (authStore.user?.default_charity ? "charity selected" : "no charity selected"))
    const defaultCharityLetter = computed(() => (authStore.user?.default_charity ? "♥" : "–"))

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
        return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
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
                name: available ? s.name : "no longer available",
                isPublic: s.is_public,
                isActive: s.is_active,
                available,
                startDateLabel: formatDate(s.start_date),
                painted: available ? s.pattern.filter((l) => l > 0).length : 0,
                weeks: available ? s.pattern.length / DAYS : 0,
                previewCells: available ? s.pattern.map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })) : [],
                runStatusLabel: formatRunStatusLabel(s.design_id),
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
        { value: String(authoredSelections.value.length), label: "designs created" },
        { value: authoredSelections.value.filter((s) => s.is_public).length + " public", label: "on your profile now" },
    ])
</script>

<template>
    <div class="page">

        <AppNavbar sticky />

        <main class="main">

            <!-- PAGE HEADER -->
            <div class="page-header">
                <div>
                    <div class="eyebrow">// welcome back</div>
                    <h1 class="page-title">{{ displayName }}</h1>
                </div>
                <RouterLink to="/editor"><BaseButton class="new-design-btn">+ new design</BaseButton></RouterLink>
            </div>

            <!-- STATS ROW -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 stats-row">
                <div v-for="s in statCards" :key="s.label" class="stat-card">
                    <div class="stat-value">{{ s.value }}</div>
                    <div class="stat-label">{{ s.label }}</div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] items-start gap-7">

                <!-- YOUR DESIGNS -->
                <div>
                    <div class="section-label">your designs</div>
                    <div v-if="activeToggleError" class="toggle-error">{{ activeToggleError }}</div>
                    <div v-if="designsStore.isLoading" class="empty-state">loading…</div>
                    <div v-else-if="designs.length === 0" class="empty-state">no designs yet - head to the editor to create one.</div>
                    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div v-for="d in designs" :key="d.id" class="design-card">
                            <div v-if="d.available" class="design-preview">
                                <ContributionGridPreview :cells="d.previewCells" :weeks="d.weeks" height="90px" />
                            </div>
                            <div v-else class="preview-unavailable">preview unavailable</div>
                            <div class="design-body">
                                <div class="design-header-row">
                                    <span class="design-name">{{ d.name }}</span>
                                    <!-- unselected badge bg is a fainter alpha (0.06) than --color-border (0.08) - close but
                                         distinct enough on this chip that snapping it to the token reads visibly different -->
                                    <span
                                        v-if="d.available"
                                        class="design-badge"
                                        :style="{
                                            color: d.isPublic ? 'var(--color-accent-brighter)' : 'var(--color-text-muted-4)',
                                            background: d.isPublic ? 'var(--color-accent-soft)' : 'oklch(100% 0 0 / 0.06)',
                                        }"
                                    >{{ d.isPublic ? 'public' : 'private' }}</span>
                                </div>
                                <div class="design-meta">{{ d.startDateLabel }} · {{ d.painted }} squares</div>
                                <div
                                    v-if="d.runStatusLabel"
                                    class="run-status-label"
                                    :style="{ color: d.runStatusLabel.includes('failed') ? 'var(--color-danger)' : 'var(--color-text-muted-4)' }"
                                >{{ d.runStatusLabel }}</div>
                                <div v-else class="run-status-spacer"></div>
                                <div class="active-row">
                                    <span class="active-label">active</span>
                                    <ToggleSwitch :data-testid="'active-toggle-' + d.id" :checked="d.isActive" @click="toggleActive(d.id)" />
                                </div>
                                <div class="design-actions">
                                    <RouterLink :to="'/editor/' + d.id" class="flex-1"><BaseButton variant="secondary" class="edit-btn">edit</BaseButton></RouterLink>
                                    <BaseButton variant="secondary" class="receipt-btn">receipt</BaseButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SIDEBAR -->
                <div>
                    <div class="section-label">github sync</div>
                    <div class="sync-card">
                        <div class="sync-icon">✓</div>
                        <div>
                            <div class="sync-label">connected</div>
                        </div>
                    </div>

                    <div class="section-label">default preferences</div>
                    <div class="pref-card">
                        <div class="pref-avatar">{{ defaultCharityLetter }}</div>
                        <div>
                            <div class="pref-name">{{ defaultCharityLabel }}</div>
                            <RouterLink to="/settings" class="change-default-link">change default</RouterLink>
                        </div>
                    </div>
                    <div class="opt-in-card">
                        <div>
                            <div class="opt-in-label">share new designs by default</div>
                        </div>
                        <ToggleSwitch data-testid="public-opt-in-toggle" :checked="!!authStore.user?.public_opt_in" @click="togglePublicOptIn" />
                    </div>

                    <div class="section-label">recent receipts</div>
                    <div class="empty-state">no receipts yet - they'll show up here once you make a donation.</div>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
    .page {
        font-family: var(--font-sans);
        background: var(--color-bg);
        color: var(--color-text);
        min-height: 100vh;
    }

    .main {
        max-width: 1240px;
        margin: 0 auto;
        padding: clamp(28px, 4vw, 44px) clamp(20px, 4vw, 32px) 80px;
    }

    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 32px;
    }

    .eyebrow {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-accent-bright);
        margin-bottom: 8px;
    }

    .page-title {
        font-family: var(--font-mono);
        font-size: clamp(24px, 2.8vw, 32px);
        font-weight: 700;
        margin: 0;
    }

    .new-design-btn {
        font-size: 13.5px;
        border-radius: 8px;
        padding: 12px 18px;
        text-decoration: none;
    }

    .stats-row {
        margin-bottom: 36px;
    }

    .stat-card {
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 18px 20px;
    }

    .stat-value {
        font-family: var(--font-mono);
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 4px;
    }

    .stat-label {
        font-size: 12.5px;
        color: var(--color-text-muted-4);
    }

    .section-label {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-3);
        letter-spacing: 0.02em;
        margin-bottom: 16px;
    }

    .toggle-error {
        font-size: 13px;
        color: var(--color-danger);
        margin-bottom: 16px;
    }

    .empty-state {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-4);
    }

    .design-card {
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow: hidden;
    }

    .design-preview {
        padding: 14px;
    }

    .preview-unavailable {
        padding: 14px;
        height: 90px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-4);
    }

    .design-body {
        padding: 0 16px 16px;
    }

    .design-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
    }

    .design-name {
        font-family: var(--font-mono);
        font-size: 13.5px;
        font-weight: 600;
    }

    .design-badge {
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 600;
        border-radius: 5px;
        padding: 3px 8px;
    }

    .design-meta {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-4);
        margin-bottom: 4px;
    }

    .run-status-label {
        font-family: var(--font-mono);
        font-size: 11.5px;
        margin-bottom: 12px;
    }

    .run-status-spacer {
        margin-bottom: 12px;
    }

    .active-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;
        /* fainter alpha (0.06) than --color-border (0.08) - deliberately subtler divider inside the card */
        border-top: 1px solid oklch(100% 0 0 / 0.06);
        margin-bottom: 8px;
    }

    .active-label {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-4);
    }

    .design-actions {
        display: flex;
        gap: 8px;
    }

    .flex-1 {
        flex: 1;
    }

    .edit-btn {
        width: 100%;
        font-size: 12px;
        background: var(--color-bg-inset);
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-mid);
        border-radius: 6px;
        padding: 8px;
        text-decoration: none;
        text-align: center;
    }

    .receipt-btn {
        flex: 1;
        font-size: 12px;
        color: var(--color-text-muted-4);
        border: 1px solid var(--color-border-mid);
        border-radius: 6px;
        padding: 8px;
    }

    .sync-card {
        display: flex;
        align-items: center;
        gap: 12px;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 28px;
    }

    .sync-icon {
        flex: none;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: var(--color-accent-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-accent-brighter);
        font-weight: 700;
    }

    .sync-label {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 600;
    }

    .pref-card {
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 14px;
        border-radius: 10px;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        margin-bottom: 12px;
    }

    .pref-avatar {
        flex: none;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: var(--color-bg-chip);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-weight: 700;
        color: var(--color-accent-bright);
        font-size: 12px;
    }

    .pref-name {
        font-family: var(--font-mono);
        font-size: 12.5px;
        font-weight: 600;
    }

    .change-default-link {
        font-family: var(--font-mono);
        font-size: 11.5px;
    }

    .opt-in-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px;
        border-radius: 10px;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        margin-bottom: 28px;
    }

    .opt-in-label {
        font-family: var(--font-mono);
        font-size: 12.5px;
        font-weight: 600;
        margin-bottom: 2px;
    }
</style>
