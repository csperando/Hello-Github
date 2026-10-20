<script setup lang="ts">
    import { computed, ref, watch } from "vue"

    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseTextInput from "@/components/ui/BaseTextInput.vue"
    import AdminHistoryList from "./AdminHistoryList.vue"
    import { formatCents, formatDate, parseDollarsToCents } from "@/helpers/format"
    import { REFUND_STATE_LABELS } from "@/helpers/adminStatus"
    import { getPaymentHistory, recordRefund, type iAdminPayment, type iHistoryEntry, type RefundState } from "@/services/admin"
    import { errorMessage } from "@/services/errors"

    /**
     * Records a refund that was already made in Stripe - it only updates our
     * records. The status select and the amount stay in step: refunded means
     * the whole charge, paid means nothing.
     */
    const props = defineProps<{ payment: iAdminPayment }>()
    const emit = defineEmits<{ saved: [payment: iAdminPayment]; close: [] }>()

    const today = () => new Date().toISOString().slice(0, 10)

    const state = ref<RefundState>("paid")
    const amountText = ref("")
    const refundedAt = ref("")
    const refundId = ref("")
    const note = ref("")
    const saving = ref(false)
    const error = ref("")
    const history = ref<iHistoryEntry[]>([])

    function load(payment: iAdminPayment) {
        state.value = payment.refund_state
        amountText.value = (payment.amount_refunded_cents / 100).toFixed(2)
        refundedAt.value = payment.refunded_at ? payment.refunded_at.slice(0, 10) : ""
        refundId.value = payment.stripe_refund_id ?? ""
        note.value = payment.admin_note ?? ""
        error.value = ""
        loadHistory(payment.id)
    }

    async function loadHistory(paymentId: string) {
        try {
            const res = await getPaymentHistory(paymentId)
            history.value = res.ok ? ((await res.json()).data ?? []) : []
        } catch {
            history.value = []
        }
    }

    watch(() => props.payment, load, { immediate: true })

    function onStateChange(value: RefundState) {
        state.value = value
        if (value === "paid") amountText.value = "0.00"
        if (value === "refunded") amountText.value = (props.payment.amount_total_cents / 100).toFixed(2)
        if (value !== "paid" && !refundedAt.value) refundedAt.value = today()
    }

    const splitLabel = computed(() => {
        const p = props.payment
        const parts = [`${formatCents(p.amount_platform_cents)} platform`]
        if (p.amount_charity_cents > 0) parts.push(`${formatCents(p.amount_charity_cents)} ${p.charity_name ?? "charity"}`)
        return parts.join(" · ")
    })

    async function save() {
        error.value = ""
        const cents = state.value === "paid" ? 0 : parseDollarsToCents(amountText.value)
        if (cents === null || cents > props.payment.amount_total_cents) {
            error.value = `Enter an amount from $0.00 to ${formatCents(props.payment.amount_total_cents)}.`
            return
        }
        if (state.value === "partially_refunded" && (cents === 0 || cents === props.payment.amount_total_cents)) {
            error.value = "A partial refund is more than $0.00 and less than the full charge."
            return
        }

        saving.value = true
        try {
            const res = await recordRefund(props.payment.id, {
                amount_refunded_cents: cents,
                refunded_at: cents > 0 ? refundedAt.value || null : null,
                stripe_refund_id: refundId.value.trim() || null,
                admin_note: note.value.trim() || null,
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                error.value = errorMessage(body, "Couldn't save the refund.")
                return
            }
            emit("saved", body.data[0])
        } finally {
            saving.value = false
        }
    }
</script>

<template>
    <aside class="panel" aria-labelledby="refund-title">
        <div class="panel-header">
            <div>
                <h2 id="refund-title" class="panel-title">Record a refund</h2>
                <div class="panel-sub">@{{ payment.github_username }} · {{ formatDate(payment.created_at) }} · {{ payment.kind === "one_time" ? "one-time" : "subscription" }}</div>
            </div>
            <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
        </div>

        <dl class="facts">
            <div><dt>charged</dt><dd class="mono strong">{{ formatCents(payment.amount_total_cents) }}</dd></div>
            <div><dt>split</dt><dd>{{ splitLabel }}</dd></div>
            <div v-if="payment.design_name" class="facts-wide"><dt>for</dt><dd>{{ payment.design_name }} · {{ payment.design_year }}</dd></div>
            <div v-if="payment.stripe_object_id" class="facts-wide"><dt>stripe payment</dt><dd class="mono small">{{ payment.stripe_object_id }}</dd></div>
        </dl>

        <form class="fields" @submit.prevent="save">
            <div class="field">
                <label for="refund-state" class="field-label">status</label>
                <select
                    id="refund-state"
                    class="select"
                    :value="state"
                    @change="onStateChange(($event.target as HTMLSelectElement).value as RefundState)"
                >
                    <option v-for="(label, value) in REFUND_STATE_LABELS" :key="value" :value="value">{{ label }}</option>
                </select>
            </div>

            <div v-if="state !== 'paid'" class="field-row">
                <div class="field">
                    <label for="refund-amount" class="field-label">amount refunded ($)</label>
                    <BaseTextInput
                        id="refund-amount"
                        v-model="amountText"
                        variant="compact"
                        clear-label="Clear amount"
                        :disabled="state === 'refunded'"
                    />
                </div>
                <div class="field">
                    <label for="refund-date" class="field-label">refunded on</label>
                    <input id="refund-date" v-model="refundedAt" type="date" class="date-input" />
                </div>
            </div>

            <div v-if="state !== 'paid'" class="field">
                <label for="refund-id" class="field-label">stripe refund id</label>
                <BaseTextInput id="refund-id" v-model="refundId" placeholder="re_…" variant="compact" clear-label="Clear refund id" />
            </div>

            <div class="field">
                <label for="refund-note" class="field-label">note (internal)</label>
                <textarea id="refund-note" v-model="note" rows="3" class="textarea"></textarea>
            </div>

            <p class="warning">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>
                <span>This only updates our records - it doesn't move any money. Issue the refund in Stripe first. The paint job for this payment isn't changed.</span>
            </p>

            <p v-if="error" class="error" role="alert">{{ error }}</p>

            <div class="actions">
                <BaseButton type="button" variant="secondary" class="cancel-btn" @click="emit('close')">cancel</BaseButton>
                <BaseButton type="submit" :loading="saving" :disabled="saving">save</BaseButton>
            </div>
        </form>

        <AdminHistoryList :entries="history" />
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

    .facts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 16px;
        margin: 0 0 16px;
        padding: 14px;
        background: var(--color-bg-inset);
        border-radius: 8px;
        font-size: 13px;
    }

    .facts dt {
        color: var(--color-text-muted-4);
        font-size: 11.5px;
        font-family: var(--font-mono);
    }

    .facts dd {
        margin: 2px 0 0;
        overflow-wrap: anywhere;
    }

    .facts-wide {
        grid-column: 1 / -1;
    }

    .mono {
        font-family: var(--font-mono);
    }

    .strong {
        font-weight: 600;
    }

    .small {
        font-size: 12px;
    }

    .fields {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }

    /* BaseTextInput brings its own bottom margin - fields here space by gap */
    .field :deep(.base-text-input-wrap) {
        margin-bottom: 0;
    }

    .field-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .field-label {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-text-muted-3);
    }

    .select,
    .date-input,
    .textarea {
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 8px;
        font: inherit;
        box-sizing: border-box;
        width: 100%;
    }

    .select,
    .date-input {
        min-height: 44px;
        padding: 0 12px;
    }

    .textarea {
        padding: 10px 12px;
        resize: vertical;
    }

    .select:focus,
    .date-input:focus,
    .textarea:focus {
        outline: none;
        border-color: var(--color-accent);
    }

    .warning {
        display: flex;
        gap: 10px;
        margin: 0;
        padding: 12px;
        border-radius: 8px;
        background: oklch(80% 0.16 90 / 0.1); /* --color-warning wash */
        color: var(--color-warning);
        font-size: 12.5px;
        line-height: 1.5;
    }

    .warning svg {
        flex: none;
        margin-top: 2px;
    }

    .error {
        margin: 0;
        font-size: 12.5px;
        color: var(--color-danger);
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
    }

    .cancel-btn {
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border-mid);
    }
</style>
