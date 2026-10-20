<script setup lang="ts">
    import { computed, onMounted, ref, watch } from "vue"
    import { useRoute } from "vue-router"

    import StatusChip from "@/components/admin/StatusChip.vue"
    import UserAccountForm from "@/components/admin/UserAccountForm.vue"
    import { formatCents, formatDate } from "@/helpers/format"
    import { PAINT_STATUS_TONES, REFUND_STATE_LABELS, REFUND_STATE_TONES } from "@/helpers/adminStatus"
    import { getAdminUser, restoreUserDesign, type iAdminUserDetail, type iAdminUserDesign } from "@/services/admin"
    import { errorMessage } from "@/services/errors"
    import { useAuthStore } from "@/stores/auth"
    import { useDesignsStore } from "@/stores/designs"

    const route = useRoute()
    const authStore = useAuthStore()
    const designsStore = useDesignsStore()

    const detail = ref<iAdminUserDetail | null>(null)
    const loadError = ref("")
    const restoring = ref<string | null>(null)
    const restoreError = ref("")

    const userId = computed(() => String(route.params.userId))
    const isSelf = computed(() => authStore.user?.id === userId.value)

    async function load() {
        loadError.value = ""
        try {
            const res = await getAdminUser(userId.value)
            if (!res.ok) {
                loadError.value = res.status === 404 ? "No such user." : "Couldn't load this user."
                detail.value = null
                return
            }
            detail.value = (await res.json()).data[0]
        } catch {
            loadError.value = "Couldn't load this user."
        }
    }

    watch(userId, load)
    onMounted(() => {
        designsStore.fetchPaintStatuses()
        load()
    })

    async function restore(design: iAdminUserDesign) {
        restoreError.value = ""
        restoring.value = design.design_id
        try {
            const res = await restoreUserDesign(userId.value, design.design_id)
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                restoreError.value = errorMessage(body, "Couldn't restore this design.")
                return
            }
            detail.value = body.data[0]
        } finally {
            restoring.value = null
        }
    }

    const initial = computed(() => (detail.value?.user.github_username ?? "?").charAt(0).toUpperCase())
</script>

<template>
    <div>
        <RouterLink to="/admin/users" class="back-link">← all users</RouterLink>

        <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>

        <template v-else-if="detail">
            <div class="header">
                <div class="identity">
                    <img v-if="detail.user.avatar_url" :src="detail.user.avatar_url" alt="" class="avatar" />
                    <div v-else aria-hidden="true" class="avatar avatar--letter">{{ initial }}</div>
                    <div>
                        <h1 class="title">@{{ detail.user.github_username }}</h1>
                        <div class="muted small">
                            <template v-if="detail.user.display_name">{{ detail.user.display_name }} · </template>
                            GitHub id {{ detail.user.github_id }} · joined {{ formatDate(detail.user.created_at) }}
                        </div>
                    </div>
                </div>
                <div class="stats">
                    <div><div class="stat-value" data-testid="user-contributed">{{ formatCents(detail.contributed_cents) }}</div><div class="stat-label">contributed</div></div>
                    <div><div class="stat-value">{{ detail.designs.filter((d) => !d.deleted_at).length }}</div><div class="stat-label">designs</div></div>
                </div>
            </div>

            <div class="layout">
                <UserAccountForm class="account" :user="detail.user" :is-self="isSelf" @saved="detail = $event" />

                <div class="tables">
                    <section aria-labelledby="designs-title" class="table-card">
                        <h2 id="designs-title" class="table-title">Designs</h2>
                        <p v-if="detail.designs.length === 0" class="table-message">no designs.</p>
                        <table v-else class="table">
                            <thead>
                                <tr>
                                    <th scope="col">name</th>
                                    <th scope="col">year</th>
                                    <th scope="col">paint status</th>
                                    <th scope="col"><span class="sr-only">actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="d in detail.designs" :key="d.id" data-testid="user-design-row">
                                    <td>
                                        <span class="strong">{{ d.name }}</span>
                                        <span v-if="d.deleted_at" class="muted small"> · deleted {{ formatDate(d.deleted_at) }}</span>
                                    </td>
                                    <td class="mono">{{ d.year }}</td>
                                    <td><StatusChip :label="designsStore.paintStatusLabel(d.paint_status)" :tone="PAINT_STATUS_TONES[d.paint_status]" /></td>
                                    <td class="action-cell">
                                        <button
                                            v-if="d.deleted_at"
                                            type="button"
                                            class="link-btn"
                                            :disabled="restoring === d.design_id"
                                            :aria-label="`Restore ${d.name}`"
                                            @click="restore(d)"
                                        >restore</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <p v-if="restoreError" class="error table-error" role="alert">{{ restoreError }}</p>
                    </section>

                    <section aria-labelledby="payments-title" class="table-card">
                        <h2 id="payments-title" class="table-title">Payments</h2>
                        <p v-if="detail.payments.length === 0" class="table-message">no payments.</p>
                        <table v-else class="table">
                            <thead>
                                <tr>
                                    <th scope="col">date</th>
                                    <th scope="col" class="num">charged</th>
                                    <th scope="col">for</th>
                                    <th scope="col">status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="p in detail.payments" :key="p.id">
                                    <td class="mono muted nowrap">{{ formatDate(p.created_at) }}</td>
                                    <td class="mono strong num">
                                        {{ formatCents(p.amount_total_cents) }}
                                        <div v-if="p.amount_refunded_cents > 0" class="faint">−{{ formatCents(p.amount_refunded_cents) }}</div>
                                    </td>
                                    <td class="muted">{{ p.design_name ? `${p.design_name} · ${p.design_year}` : p.kind === "subscription" ? "subscription" : "-" }}</td>
                                    <td><StatusChip :label="REFUND_STATE_LABELS[p.refund_state]" :tone="REFUND_STATE_TONES[p.refund_state]" /></td>
                                </tr>
                            </tbody>
                        </table>
                        <p class="table-footnote">Record refunds under <RouterLink to="/admin/payments">payments</RouterLink>.</p>
                    </section>
                </div>
            </div>
        </template>

        <p v-else class="muted">loading…</p>
    </div>
</template>

<style scoped>
    .back-link {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-accent-bright);
        margin-bottom: 4px;
    }

    .header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 24px;
    }

    .identity {
        display: flex;
        align-items: center;
        gap: 14px;
    }

    .avatar {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        object-fit: cover;
    }

    .avatar--letter {
        background: var(--color-bg-chip);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-weight: 700;
        font-size: 18px;
        color: var(--color-accent-bright);
    }

    .title {
        margin: 0 0 2px;
        font-family: var(--font-mono);
        font-size: 24px;
        font-weight: 700;
    }

    .stats {
        display: flex;
        flex-wrap: wrap;
        gap: 24px;
    }

    .stat-value {
        font-family: var(--font-mono);
        font-size: 20px;
        font-weight: 700;
    }

    .stat-label {
        font-size: 12px;
        color: var(--color-text-muted-3);
    }

    .layout {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        align-items: flex-start;
    }

    .account {
        flex: 1 1 320px;
        max-width: 440px;
    }

    .tables {
        flex: 999 1 480px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .table-card {
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow-x: auto;
    }

    .table-title {
        margin: 0;
        padding: 16px 16px 4px;
        font-family: var(--font-mono);
        font-size: 15px;
    }

    .table {
        width: 100%;
        min-width: 520px;
        border-collapse: collapse;
        font-size: 13.5px;
    }

    .table th {
        text-align: left;
        padding: 10px 16px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 500;
        color: var(--color-text-muted-3);
    }

    .table td {
        padding: 10px 16px;
        border-top: 1px solid var(--color-border);
    }

    .action-cell {
        text-align: right;
        padding-top: 4px !important;
        padding-bottom: 4px !important;
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

    .link-btn:disabled {
        opacity: 0.5;
        cursor: wait;
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

    .muted {
        color: var(--color-text-muted-2);
    }

    .faint {
        font-size: 11.5px;
        color: var(--color-text-muted-4);
        font-weight: 400;
    }

    .small {
        font-size: 12.5px;
    }

    .nowrap {
        white-space: nowrap;
    }

    .table-message,
    .table-footnote {
        margin: 0;
        padding: 12px 16px 16px;
        font-size: 12.5px;
        color: var(--color-text-muted-3);
    }

    .table-footnote a {
        color: var(--color-accent-bright);
    }

    .error {
        color: var(--color-danger);
        font-size: 13px;
    }

    .table-error {
        margin: 0;
        padding: 0 16px 12px;
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
