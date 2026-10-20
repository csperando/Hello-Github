<script setup lang="ts">
    import { computed, ref, watch } from "vue"

    import BaseButton from "@/components/ui/BaseButton.vue"
    import ConfirmDialog from "@/components/ui/ConfirmDialog.vue"
    import ContributionGridPreview from "@/components/ui/ContributionGridPreview.vue"
    import StatusChip from "./StatusChip.vue"
    import AdminHistoryList from "./AdminHistoryList.vue"
    import { LEVEL_COLORS } from "@/helpers/grid"
    import { formatDate } from "@/helpers/format"
    import { JOB_STATUS_TONES } from "@/helpers/adminStatus"
    import { cancelJob, getJobHistory, retryJob, type iAdminJob, type iHistoryEntry } from "@/services/admin"
    import { errorMessage } from "@/services/errors"

    // mirror the API's rules - it refuses anything else with a 409 anyway
    const RETRYABLE = ["failed"]
    const CANCELLABLE = ["pending_payment", "awaiting_issue", "ready", "failed"]

    const props = defineProps<{ job: iAdminJob }>()
    const emit = defineEmits<{ updated: [job: iAdminJob]; close: [] }>()

    const history = ref<iHistoryEntry[]>([])
    const confirming = ref<"retry" | "cancel" | null>(null)
    const working = ref(false)
    const error = ref("")

    async function loadHistory(jobId: string) {
        try {
            const res = await getJobHistory(jobId)
            history.value = res.ok ? ((await res.json()).data ?? []) : []
        } catch {
            history.value = []
        }
    }

    watch(
        () => props.job,
        (job) => {
            error.value = ""
            loadHistory(job.id)
        },
        { immediate: true },
    )

    const canRetry = computed(() => RETRYABLE.includes(props.job.status))
    const canCancel = computed(() => CANCELLABLE.includes(props.job.status))

    const previewCells = computed(() => props.job.pattern.map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })))
    const previewWeeks = computed(() => props.job.pattern.length / 7)
    const copyCaption = computed(() => {
        const weeks = previewWeeks.value
        const from = formatDate(props.job.start_date)
        return props.job.custom_range
            ? `${weeks}-column custom range from ${from}, repeating through Dec 31, ${props.job.year}.`
            : `${weeks}-column design from ${from}, painted once in ${props.job.year}.`
    })

    async function confirmAction() {
        const action = confirming.value
        confirming.value = null
        if (!action) return
        error.value = ""
        working.value = true
        try {
            const res = action === "retry" ? await retryJob(props.job.id) : await cancelJob(props.job.id)
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                error.value = errorMessage(body, `Couldn't ${action} this paint.`)
                return
            }
            emit("updated", body.data[0])
        } finally {
            working.value = false
        }
    }
</script>

<template>
    <aside class="panel" aria-labelledby="job-title">
        <div class="panel-header">
            <div>
                <h2 id="job-title" class="panel-title">{{ job.design_name }} · {{ job.year }}</h2>
                <div class="panel-sub">@{{ job.github_username }} · started {{ formatDate(job.created_at) }}</div>
            </div>
            <div class="header-right">
                <StatusChip :label="job.status_label" :tone="JOB_STATUS_TONES[job.status]" />
                <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
            </div>
        </div>

        <figure class="copy">
            <ContributionGridPreview :cells="previewCells" :weeks="previewWeeks" height="80px" />
            <figcaption class="copy-caption">The job's own copy: {{ copyCaption }}</figcaption>
        </figure>

        <div v-if="job.last_error" class="last-error">
            <div class="last-error-label">last error</div>
            <div class="last-error-text">{{ job.last_error }}</div>
        </div>

        <div v-if="canRetry || canCancel" class="actions">
            <BaseButton v-if="canRetry" type="button" :loading="working" :disabled="working" @click="confirming = 'retry'">
                retry paint - no new payment
            </BaseButton>
            <BaseButton v-if="canCancel" type="button" variant="secondary" class="secondary-btn" :disabled="working" @click="confirming = 'cancel'">
                cancel paint
            </BaseButton>
            <p v-if="canRetry" class="hint">Retry puts the job back in the queue; it repaints from the same copy. While it's queued, the user's design is locked again.</p>
        </div>
        <p v-else-if="job.status === 'painting'" class="hint">This paint is in progress - it can't be retried or cancelled until the backfill finishes.</p>

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <AdminHistoryList :entries="history" />

        <ConfirmDialog
            :open="confirming === 'retry'"
            title="retry this paint?"
            confirm-label="retry paint"
            cancel-label="not now"
            @confirm="confirmAction"
            @cancel="confirming = null"
        >
            It goes back in the queue and repaints {{ job.design_name }} on @{{ job.github_username }}'s {{ job.year }} graph from the same copy. They aren't charged again.
        </ConfirmDialog>

        <ConfirmDialog
            :open="confirming === 'cancel'"
            title="cancel this paint?"
            confirm-label="cancel paint"
            cancel-label="keep it"
            @confirm="confirmAction"
            @cancel="confirming = null"
        >
            It won't be painted. This doesn't refund anything - do that in Stripe and record it under Payments.
        </ConfirmDialog>
    </aside>
</template>

<style scoped>
    .panel {
        background: var(--color-bg-raised);
        border: 1px solid var(--color-accent-border);
        border-radius: 12px;
        padding: 20px;
        box-sizing: border-box;
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
    }

    .header-right {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .panel-title {
        margin: 0 0 4px;
        font-family: var(--font-mono);
        font-size: 16px;
    }

    .panel-sub {
        font-size: 12.5px;
        color: var(--color-text-muted-3);
    }

    .close-btn {
        width: 44px;
        height: 44px;
        margin: -10px -10px 0 0;
        background: none;
        border: none;
        color: var(--color-text-muted-3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .copy {
        margin: 0 0 14px;
        padding: 14px;
        background: var(--color-bg-inset);
        border-radius: 8px;
        overflow-x: auto;
    }

    .copy-caption {
        margin-top: 10px;
        font-size: 12px;
        color: var(--color-text-muted-3);
    }

    .last-error {
        padding: 12px;
        border-radius: 8px;
        background: oklch(70% 0.19 25 / 0.1); /* --color-danger wash */
        margin-bottom: 14px;
    }

    .last-error-label {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-danger);
        margin-bottom: 4px;
    }

    .last-error-text {
        font-size: 12.5px;
        line-height: 1.5;
        color: var(--color-text-muted-1);
        overflow-wrap: anywhere;
    }

    .actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .secondary-btn {
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border-mid);
        min-height: 44px;
    }

    .hint {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted-3);
    }

    .error {
        margin: 10px 0 0;
        font-size: 12.5px;
        color: var(--color-danger);
    }
</style>
