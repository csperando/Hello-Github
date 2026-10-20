<script setup lang="ts">
    import { onMounted, ref, watch } from "vue"

    import StatusChip from "@/components/admin/StatusChip.vue"
    import JobDetailPanel from "@/components/admin/JobDetailPanel.vue"
    import { formatDate } from "@/helpers/format"
    import { JOB_STATUS_TONES } from "@/helpers/adminStatus"
    import { listAdminJobs, type AdminJobFilter, type iAdminJob } from "@/services/admin"

    const FILTERS: { value: AdminJobFilter; label: string }[] = [
        { value: "all", label: "all" },
        { value: "needs_attention", label: "needs attention" },
        { value: "in_progress", label: "in progress" },
        { value: "painted", label: "painted" },
        { value: "cancelled", label: "cancelled" },
        { value: "pending_payment", label: "awaiting payment" },
    ]

    const filter = ref<AdminJobFilter>("needs_attention")
    const jobs = ref<iAdminJob[]>([])
    const counts = ref<Partial<Record<AdminJobFilter, number>>>({})
    const loading = ref(false)
    const loadError = ref("")
    const selected = ref<iAdminJob | null>(null)

    async function load() {
        loading.value = true
        loadError.value = ""
        try {
            const res = await listAdminJobs(filter.value)
            if (!res.ok) {
                loadError.value = "Couldn't load paint jobs."
                return
            }
            const data = (await res.json()).data?.[0]
            jobs.value = data?.jobs ?? []
            counts.value = data?.counts ?? {}
        } catch {
            loadError.value = "Couldn't load paint jobs."
        } finally {
            loading.value = false
        }
    }

    watch(filter, load)
    onMounted(load)

    // a retried or cancelled job may have left this filter - reload the list
    // and counts, keeping the panel on the updated job
    async function onUpdated(updated: iAdminJob) {
        selected.value = updated
        await load()
    }
</script>

<template>
    <div>
        <h1 class="title">Paint jobs</h1>
        <p class="intro">One job per paid paint. Each paints its own copy of the design, taken at checkout.</p>

        <div class="filters" role="group" aria-label="Filter by status">
            <button
                v-for="f in FILTERS"
                :key="f.value"
                type="button"
                class="filter-btn"
                :class="{ 'filter-btn--selected': filter === f.value }"
                :aria-pressed="filter === f.value"
                @click="filter = f.value"
            >
                {{ f.label }} <span class="filter-count">{{ counts[f.value] ?? 0 }}</span>
            </button>
        </div>

        <div class="layout">
            <section aria-label="Paint jobs" class="table-card">
                <p v-if="loadError" class="table-message table-message--error" role="alert">{{ loadError }}</p>
                <p v-else-if="loading && jobs.length === 0" class="table-message">loading…</p>
                <p v-else-if="jobs.length === 0" class="table-message">no paint jobs here.</p>
                <table v-else class="table">
                    <thead>
                        <tr>
                            <th scope="col">user · design</th>
                            <th scope="col">year</th>
                            <th scope="col">status</th>
                            <th scope="col">updated</th>
                            <th scope="col"><span class="sr-only">actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="job in jobs" :key="job.id" :class="{ 'row--selected': selected?.id === job.id }" data-testid="job-row">
                            <td>
                                <div class="strong">@{{ job.github_username }}</div>
                                <div class="muted small">{{ job.design_name }}</div>
                            </td>
                            <td class="mono">{{ job.year }}</td>
                            <td><StatusChip :label="job.status_label" :tone="JOB_STATUS_TONES[job.status]" /></td>
                            <td class="mono small muted nowrap">{{ formatDate(job.updated_at) }}</td>
                            <td class="action-cell">
                                <button type="button" class="link-btn" :aria-label="`Open ${job.design_name} ${job.year} for @${job.github_username}`" @click="selected = job">open</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <JobDetailPanel v-if="selected" class="side-panel" :job="selected" @updated="onUpdated" @close="selected = null" />
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
        max-width: 640px;
        line-height: 1.5;
        color: var(--color-text-muted-3);
    }

    .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
    }

    .filter-btn {
        min-height: 44px;
        padding: 0 14px;
        border-radius: 999px;
        background: transparent;
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-input);
        font-family: var(--font-mono);
        font-size: 12.5px;
        cursor: pointer;
    }

    .filter-btn--selected {
        background: var(--color-accent-soft);
        color: var(--color-accent-bright);
        border-color: var(--color-accent-border);
    }

    .filter-count {
        opacity: 0.75;
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
        min-width: 640px;
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
    }

    .row--selected {
        background: oklch(58% 0.16 145 / 0.1); /* --color-accent at 10% */
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
