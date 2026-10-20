<script setup lang="ts">
    import { computed, onMounted, ref } from "vue"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import ContributionGridPreview from "@/components/ui/ContributionGridPreview.vue"
    import { LEVEL_COLORS } from "@/helpers/grid"
    import { useDesignsStore } from "@/stores/designs"
    import { useAuthStore } from "@/stores/auth"
    import { getOrgById } from "@/services/api"
    import { listPayments, type iPayment } from "@/services/payments"

    const DAYS = 7

    const designsStore = useDesignsStore()
    // authStore.user is already populated here: the router's requiresAuth guard
    // (vue/src/router/index.ts) awaits fetchMe() before this route resolves.
    const authStore = useAuthStore()

    onMounted(() => {
        designsStore.fetchSelections()
        designsStore.fetchPaintStatuses()
        loadPayments()
        loadDefaultCharity()
    })

    const displayName = computed(
        () => authStore.user?.display_name || authStore.user?.name || authStore.user?.github_username || "",
    )

    // ----- default charity: its name, looked up by its eo_bmf id -------------
    const defaultCharityName = ref<string | null>(null)

    async function loadDefaultCharity(): Promise<void> {
        const id = authStore.user?.default_charity
        if (!id) return
        try {
            const res = await getOrgById(id)
            if (!res.ok) return
            const body = await res.json()
            // getOrgById returns the org object when found, [] when not
            const org = Array.isArray(body.data) ? undefined : body.data
            if (org) defaultCharityName.value = org.name
        } catch {
            // non-fatal - the card just says a charity is selected
        }
    }

    const defaultCharityLabel = computed(() => {
        if (!authStore.user?.default_charity) return "no charity selected"
        return defaultCharityName.value ?? "charity selected"
    })
    const defaultCharityLetter = computed(() => {
        if (defaultCharityName.value) return defaultCharityName.value.charAt(0).toUpperCase()
        return authStore.user?.default_charity ? "♥" : "–"
    })

    // ----- total contributed: everything the user has actually paid ---------
    // The full amount charged (platform + charity), so it matches what they
    // were billed, less anything refunded. succeeded = one-time payment,
    // paid = subscription invoice.
    const PAID_STATUSES = ["succeeded", "paid"]
    const payments = ref<iPayment[]>([])

    async function loadPayments(): Promise<void> {
        try {
            const res = await listPayments()
            if (!res.ok) return
            const body = await res.json()
            payments.value = body.data ?? []
        } catch {
            // non-fatal - the total just reads $0.00
        }
    }

    const contributedCents = computed(() =>
        payments.value
            .filter((p) => PAID_STATUSES.includes(p.status))
            .reduce((sum, p) => sum + p.amount_total_cents - (p.amount_refunded_cents ?? 0), 0),
    )

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
                available,
                startDateLabel: formatDate(s.start_date),
                painted: available ? s.pattern.filter((l) => l > 0).length : 0,
                weeks: available ? s.pattern.length / DAYS : 0,
                previewCells: available ? s.pattern.map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })) : [],
                paintStatus: s.paint_status,
                paintStatusLabel: designsStore.paintStatusLabel(s.paint_status),
            }
        }),
    )

    // "designs created" counts designs the user actually authored, not ones
    // they've adopted from someone else.
    const authoredSelections = computed(() =>
        designsStore.selections.filter((s) => s.design_owner_id === authStore.user?.id),
    )
    const statCards = computed(() => [
        { value: String(authoredSelections.value.length), label: "designs created" },
        { value: `$${(contributedCents.value / 100).toFixed(2)}`, label: "contributed" },
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
                                </div>
                                <div class="design-meta">
                                    {{ d.startDateLabel }} · {{ d.painted }} squares<template v-if="d.paintStatusLabel">
                                        · <span :class="`paint-status paint-status--${d.paintStatus}`" :data-testid="'paint-status-' + d.id">{{ d.paintStatusLabel }}</span></template>
                                </div>
                                <div class="design-actions">
                                    <RouterLink :to="'/editor/' + d.id" class="flex-1"><BaseButton variant="secondary" class="edit-btn">edit</BaseButton></RouterLink>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SIDEBAR -->
                <div>
                    <div class="section-label">default charity</div>
                    <div class="pref-card">
                        <div class="pref-avatar">{{ defaultCharityLetter }}</div>
                        <div>
                            <div class="pref-name" data-testid="default-charity">{{ defaultCharityLabel }}</div>
                            <RouterLink to="/settings" class="change-default-link">change default</RouterLink>
                        </div>
                    </div>
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

    .empty-state {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-4);
    }

    .paint-status--locked {
        color: var(--color-warning);
    }

    .paint-status--painted {
        color: var(--color-accent-bright);
    }

    .paint-status--error {
        color: var(--color-danger);
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

    .design-meta {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-4);
        margin-bottom: 4px;
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

</style>
