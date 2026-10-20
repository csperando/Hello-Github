<script setup lang="ts">
    import { onMounted, onUnmounted, ref, watch } from "vue"

    import BaseTextInput from "@/components/ui/BaseTextInput.vue"
    import StatusChip from "@/components/admin/StatusChip.vue"
    import PaymentRefundPanel from "@/components/admin/PaymentRefundPanel.vue"
    import { debounce } from "@/helpers/debounce"
    import { formatCents, formatDate } from "@/helpers/format"
    import { REFUND_STATE_LABELS, REFUND_STATE_TONES } from "@/helpers/adminStatus"
    import { listAdminPayments, type iAdminPayment, type RefundState } from "@/services/admin"

    const RANGES = [
        { value: "30", label: "last 30 days" },
        { value: "90", label: "last 90 days" },
        { value: "all", label: "all time" },
    ]

    const search = ref("")
    const status = ref<RefundState | "">("")
    const range = ref("90")
    const payments = ref<iAdminPayment[]>([])
    const loading = ref(false)
    const loadError = ref("")
    const selected = ref<iAdminPayment | null>(null)

    function sinceFor(rangeValue: string): string | undefined {
        if (rangeValue === "all") return undefined
        const since = new Date()
        since.setUTCDate(since.getUTCDate() - Number(rangeValue))
        return since.toISOString().slice(0, 10)
    }

    async function load() {
        loading.value = true
        loadError.value = ""
        try {
            const res = await listAdminPayments({ search: search.value.trim(), status: status.value, since: sinceFor(range.value) })
            if (!res.ok) {
                loadError.value = "Couldn't load payments."
                return
            }
            payments.value = (await res.json()).data ?? []
        } catch {
            loadError.value = "Couldn't load payments."
        } finally {
            loading.value = false
        }
    }

    const debouncedLoad = debounce(load, 300)
    watch(search, () => debouncedLoad())
    watch([status, range], load)
    onMounted(load)
    onUnmounted(() => debouncedLoad.cancel())

    function onSaved(updated: iAdminPayment) {
        payments.value = payments.value.map((p) => (p.id === updated.id ? updated : p))
        selected.value = updated
    }

    function splitLabel(p: iAdminPayment): string {
        const parts = [`${formatCents(p.amount_platform_cents)} platform`]
        if (p.amount_charity_cents > 0) parts.push(`${formatCents(p.amount_charity_cents)} ${p.charity_name ?? "charity"}`)
        return parts.join(" · ")
    }
</script>

<template>
    <div>
        <h1 class="title">Payments</h1>
        <p class="intro">Refunds are issued in Stripe. Record them here so the user's contributed total and payment history stay right.</p>

        <div role="search" class="filters">
            <div class="filter filter--search">
                <label for="payments-search" class="filter-label">search</label>
                <BaseTextInput id="payments-search" v-model="search" placeholder="user, email or Stripe id" clear-label="Clear search">
                    <template #leading-icon>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                    </template>
                </BaseTextInput>
            </div>
            <div class="filter">
                <label for="payments-status" class="filter-label">status</label>
                <select id="payments-status" v-model="status" class="select">
                    <option value="">all</option>
                    <option v-for="(label, value) in REFUND_STATE_LABELS" :key="value" :value="value">{{ label }}</option>
                </select>
            </div>
            <div class="filter">
                <label for="payments-range" class="filter-label">date</label>
                <select id="payments-range" v-model="range" class="select">
                    <option v-for="r in RANGES" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
            </div>
        </div>

        <div class="layout">
            <section aria-label="Payments" class="table-card">
                <p v-if="loadError" class="table-message table-message--error" role="alert">{{ loadError }}</p>
                <p v-else-if="loading && payments.length === 0" class="table-message">loading…</p>
                <p v-else-if="payments.length === 0" class="table-message">no payments match.</p>
                <table v-else class="table">
                    <thead>
                        <tr>
                            <th scope="col">date</th>
                            <th scope="col">user</th>
                            <th scope="col" class="num">charged</th>
                            <th scope="col">split</th>
                            <th scope="col">status</th>
                            <th scope="col"><span class="sr-only">actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="p in payments" :key="p.id" :class="{ 'row--selected': selected?.id === p.id }" data-testid="payment-row">
                            <td class="mono nowrap">{{ formatDate(p.created_at) }}</td>
                            <td>
                                <div class="strong">@{{ p.github_username }}</div>
                                <div class="mono faint">{{ p.stripe_object_id }}</div>
                            </td>
                            <td class="mono strong num">
                                {{ formatCents(p.amount_total_cents) }}
                                <div v-if="p.amount_refunded_cents > 0" class="faint">−{{ formatCents(p.amount_refunded_cents) }}</div>
                            </td>
                            <td class="muted small">{{ splitLabel(p) }}</td>
                            <td><StatusChip :label="REFUND_STATE_LABELS[p.refund_state]" :tone="REFUND_STATE_TONES[p.refund_state]" /></td>
                            <td class="action-cell">
                                <button type="button" class="link-btn" :aria-label="`Edit payment from @${p.github_username} on ${formatDate(p.created_at)}`" @click="selected = p">
                                    {{ selected?.id === p.id ? "editing" : "edit" }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <PaymentRefundPanel v-if="selected" class="side-panel" :payment="selected" @saved="onSaved" @close="selected = null" />
        </div>
    </div>
</template>

<style scoped>
    .title {
        margin: 0 0 6px;
        font-family: var(--font-mono);
        font-size: 26px;
        font-weight: 700;
    }

    .intro {
        margin: 0 0 20px;
        max-width: 620px;
        line-height: 1.5;
        color: var(--color-text-muted-3);
    }

    .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: flex-end;
        margin-bottom: 16px;
    }

    .filter {
        flex: 0 1 180px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .filter--search {
        flex: 1 1 280px;
    }

    .filter :deep(.base-text-input-wrap) {
        margin-bottom: 0;
    }

    .filter-label {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-text-muted-3);
    }

    .select {
        min-height: 44px;
        padding: 0 12px;
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 8px;
        font: inherit;
    }

    .layout {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        align-items: flex-start;
    }

    .table-card {
        flex: 999 1 560px;
        min-width: 0;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow-x: auto;
    }

    .side-panel {
        flex: 1 1 340px;
        max-width: 440px;
    }

    .table {
        width: 100%;
        min-width: 720px;
        border-collapse: collapse;
        font-size: 13.5px;
    }

    .table th {
        text-align: left;
        padding: 12px 16px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 500;
        color: var(--color-text-muted-3);
    }

    .table td {
        padding: 12px 16px;
        border-top: 1px solid var(--color-border);
        vertical-align: top;
    }

    .row--selected {
        background: oklch(58% 0.16 145 / 0.1); /* --color-accent at 10% */
    }

    .num {
        text-align: right;
    }

    .mono {
        font-family: var(--font-mono);
    }

    .strong {
        font-weight: 600;
    }

    .faint {
        font-size: 11.5px;
        color: var(--color-text-muted-4);
        font-weight: 400;
    }

    .muted {
        color: var(--color-text-muted-2);
    }

    .small {
        font-size: 12.5px;
    }

    .nowrap {
        white-space: nowrap;
    }

    .action-cell {
        text-align: right;
        padding-top: 4px !important;
        padding-bottom: 4px !important;
        vertical-align: middle !important;
    }

    .link-btn {
        min-height: 44px;
        padding: 0 6px;
        background: none;
        border: none;
        color: var(--color-accent-bright);
        font-family: var(--font-mono);
        font-size: 12.5px;
        cursor: pointer;
        text-decoration: underline;
    }

    .table-message {
        margin: 0;
        padding: 20px 16px;
        color: var(--color-text-muted-3);
    }

    .table-message--error {
        color: var(--color-danger);
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
    }
</style>
