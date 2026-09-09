<script setup lang="ts">
    import { computed, onMounted, ref } from "vue"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import BaseSelect from "@/components/ui/BaseSelect.vue"
    import BaseTextInput from "@/components/ui/BaseTextInput.vue"
    import CharityResultsList from "@/components/ui/CharityResultsList.vue"
    import CharitySearchInput from "@/components/ui/CharitySearchInput.vue"
    import SelectedCharitySummary from "@/components/ui/SelectedCharitySummary.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import { getOrgById, updateProfile } from "@/services/api"
    import type { iOrg } from "@/services/api"
    import { listPayments, setAutoRenew, type iPayment } from "@/services/payments"
    import { useAuthStore } from "@/stores/auth"
    import { timezoneOptions } from "@/helpers/timezone"
    import { useCharitySearch } from "@/composables/useCharitySearch"

    // authStore.user is already populated here: the router's requiresAuth guard
    // (vue/src/router/index.ts) awaits fetchMe() before this route resolves.
    const authStore = useAuthStore()

    const displayName = ref(authStore.user?.display_name ?? "")
    const selectedCharity = ref<iOrg | null>(null)
    const publicOptIn = ref(authStore.user?.public_opt_in ?? true)
    const timezone = ref(authStore.user?.timezone ?? "UTC")
    const useRealEmail = ref(authStore.user?.use_real_email ?? false)
    const timezoneOpts = timezoneOptions()

    const saving = ref(false)
    const saveError = ref("")
    const saved = ref(false)

    const {
        searchResults,
        searchLoading,
        searchError,
        searchQuery,
        handleSearch: handleCharitySearch,
        handleCleared: handleCharitySearchCleared,
    } = useCharitySearch()

    // ----- billing --------------------------------------------------------
    const payments = ref<iPayment[]>([])
    const charityNames = ref<Record<number, string>>({})
    const autoRenewSaving = ref(false)
    const billingError = ref("")

    const isCovered = computed(() => authStore.isCovered)
    const paidUntilLabel = computed(() => {
        const until = authStore.user?.paid_until
        return until
            ? new Date(until).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : ""
    })
    const autoRenewOn = computed(() => !!authStore.user?.auto_renew)
    const subscriptionStatus = computed(() => authStore.user?.subscription_status ?? null)

    async function resolveOrgName(id: number): Promise<void> {
        if (charityNames.value[id]) return
        try {
            const res = await getOrgById(id)
            if (!res.ok) return
            const body = await res.json()
            const org = Array.isArray(body.data) ? undefined : body.data
            if (org) charityNames.value[id] = org.name
        } catch {
            // non-fatal - the row just shows "charity" without a name
        }
    }

    async function loadPayments(): Promise<void> {
        try {
            const res = await listPayments()
            if (!res.ok) return
            const body = await res.json()
            payments.value = body.data ?? []
            const ids = [...new Set(payments.value.map((p) => p.charity_ein_id).filter((x): x is number => x != null))]
            await Promise.all(ids.map(resolveOrgName))
        } catch {
            // non-fatal - the history list just stays empty
        }
    }

    async function toggleAutoRenew(): Promise<void> {
        if (autoRenewSaving.value) return
        billingError.value = ""
        autoRenewSaving.value = true
        const next = !autoRenewOn.value
        try {
            const res = await setAutoRenew(next)
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                billingError.value = body.error ?? "Couldn't update auto-renew. Please try again."
                return
            }
            if (authStore.user) authStore.user.auto_renew = next
        } finally {
            autoRenewSaving.value = false
        }
    }

    function fmtCents(cents: number): string {
        return `$${(cents / 100).toFixed(2)}`
    }
    function fmtPaymentDate(iso: string): string {
        return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    }

    onMounted(async () => {
        loadPayments()

        const currentId = authStore.user?.default_charity
        if (!currentId) return

        try {
            const res = await getOrgById(currentId)
            if (!res.ok) return

            const body = await res.json()
            // getOrgById's response shape is a single org object when found,
            // or [] (not an object) when not - unlike searchOrgs' always-an-array shape
            const org = Array.isArray(body.data) ? undefined : body.data
            if (org) selectedCharity.value = org
        } catch {
            // not fatal - the field just starts empty and the user can search/select fresh
        }
    })

    function togglePublic() {
        publicOptIn.value = !publicOptIn.value
        saved.value = false
    }

    function toggleUseRealEmail() {
        useRealEmail.value = !useRealEmail.value
        saved.value = false
    }

    function selectCharity(org: iOrg) {
        selectedCharity.value = org
        saved.value = false
    }

    async function save() {
        if (!authStore.user) return

        saving.value = true
        saveError.value = ""
        saved.value = false
        try {
            const res = await updateProfile(authStore.user.id, {
                display_name: displayName.value,
                default_charity: selectedCharity.value?.id,
                public_opt_in: publicOptIn.value,
                timezone: timezone.value,
                use_real_email: useRealEmail.value,
            })
            if (!res.ok) {
                saveError.value = "Something went wrong saving your profile. Please try again."
                return
            }
            authStore.user.display_name = displayName.value
            authStore.user.default_charity = selectedCharity.value?.id
            authStore.user.public_opt_in = publicOptIn.value
            authStore.user.timezone = timezone.value
            authStore.user.use_real_email = useRealEmail.value
            saved.value = true
        } catch {
            saveError.value = "Something went wrong saving your profile. Please try again."
        } finally {
            saving.value = false
        }
    }
</script>

<template>
    <div class="page">

        <AppNavbar sticky />

        <main class="main">
            <div class="content">
                <div class="eyebrow">// settings</div>
                <h1 class="title">Profile settings</h1>

                <BaseCard>
                    <label class="field-label" for="settings-display-name">display name</label>
                    <BaseTextInput
                        id="settings-display-name"
                        :model-value="displayName"
                        placeholder="e.g. Lena Ortiz"
                        @update:model-value="(v) => { displayName = v; saved = false }"
                    />

                    <label class="field-label">default charity</label>
                    <SelectedCharitySummary :charity="selectedCharity" />
                    <CharitySearchInput @search="handleCharitySearch" @cleared="handleCharitySearchCleared" />
                    <CharityResultsList
                        :results="searchResults"
                        :loading="searchLoading"
                        :error="searchError"
                        :query="searchQuery"
                        :selected-id="selectedCharity?.id ?? null"
                        @select="selectCharity"
                    />

                    <div class="toggle-row toggle-row-tall">
                        <div>
                            <div class="toggle-row-title">share to public gallery</div>
                            <div class="toggle-row-desc">let others see your design and which charity you supported</div>
                        </div>
                        <ToggleSwitch data-testid="public-opt-in-toggle" :checked="publicOptIn" @click="togglePublic" />
                    </div>

                    <label for="settings-timezone" class="field-label">timezone</label>
                    <div class="select-wrap">
                        <BaseSelect id="settings-timezone" v-model="timezone" :options="timezoneOpts" @update:model-value="saved = false" />
                    </div>
                    <p class="hint">used to schedule your commits early in your own morning, not GitHub's.</p>

                    <div class="toggle-row toggle-row-taller">
                        <div>
                            <div class="toggle-row-title">use my real GitHub email for commits</div>
                            <div class="toggle-row-desc">off (recommended) keeps your real email out of the public commit history, using a private GitHub-provided address instead</div>
                        </div>
                        <ToggleSwitch data-testid="use-real-email-toggle" :checked="useRealEmail" @click="toggleUseRealEmail" />
                    </div>

                    <div v-if="saveError" class="save-error">{{ saveError }}</div>
                    <div v-if="saved" class="save-success">Saved.</div>

                    <BaseButton @click="save" :disabled="saving" :loading="saving" full class="save-button">
                        <span v-if="saving">saving…</span>
                        <span v-else>save changes</span>
                    </BaseButton>
                </BaseCard>

                <h2 id="billing" class="title billing-title">Billing</h2>
                <BaseCard>
                    <div class="billing-status">
                        <div>
                            <div class="billing-status-label">
                                {{ isCovered ? "painting active until " + paidUntilLabel : "no active plan" }}
                            </div>
                            <div v-if="subscriptionStatus" class="billing-status-sub">
                                subscription: {{ subscriptionStatus }}
                            </div>
                        </div>
                        <RouterLink v-if="!isCovered" to="/checkout">
                            <BaseButton class="start-plan-btn">start a plan →</BaseButton>
                        </RouterLink>
                    </div>

                    <div v-if="isCovered" class="toggle-row toggle-row-tall">
                        <div>
                            <div class="toggle-row-title">auto-renew every year</div>
                            <div class="toggle-row-desc">
                                {{ autoRenewOn
                                    ? "we'll charge your saved card each year so your design keeps painting"
                                    : "your plan ends on the date above unless you renew" }}
                            </div>
                        </div>
                        <ToggleSwitch
                            data-testid="auto-renew-toggle"
                            :checked="autoRenewOn"
                            :disabled="autoRenewSaving"
                            @click="toggleAutoRenew"
                        />
                    </div>
                    <div v-if="billingError" class="save-error">{{ billingError }}</div>

                    <label class="field-label billing-history-label">payment history</label>
                    <p v-if="payments.length === 0" class="hint">no payments yet.</p>
                    <ul v-else class="history-list">
                        <li v-for="p in payments" :key="p.id" class="history-row">
                            <div class="history-main">
                                <span class="history-date">{{ fmtPaymentDate(p.created_at) }}</span>
                                <span class="history-total">{{ fmtCents(p.amount_total_cents) }}</span>
                            </div>
                            <div class="history-detail">
                                {{ fmtCents(p.amount_platform_cents) }} platform
                                <template v-if="p.amount_charity_cents > 0">
                                    · {{ fmtCents(p.amount_charity_cents) }} to
                                    {{ p.charity_ein_id != null ? (charityNames[p.charity_ein_id] || "charity") : "charity" }}
                                </template>
                                · {{ p.kind === "subscription" ? "auto-renew" : "one-time" }}
                                · {{ p.status }}
                            </div>
                        </li>
                    </ul>
                </BaseCard>
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
        display: flex;
        flex-direction: column;
    }

    .main {
        flex: 1;
        padding: clamp(28px, 4vw, 44px) clamp(20px, 4vw, 32px) 80px;
        display: flex;
        justify-content: center;
    }

    .content {
        width: 100%;
        max-width: 560px;
    }

    .eyebrow {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-accent-bright);
        margin-bottom: 14px;
    }

    .title {
        font-family: var(--font-mono);
        font-size: clamp(22px, 3vw, 28px);
        font-weight: 700;
        margin: 0 0 24px;
    }

    .field-label {
        display: block;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-3);
        margin-bottom: 7px;
    }

    .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px;
        border-radius: 8px;
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border-mid);
    }

    .toggle-row-tall {
        margin-bottom: 18px;
    }

    .toggle-row-taller {
        margin-bottom: 24px;
    }

    .toggle-row-title {
        font-family: var(--font-mono);
        font-size: 13.5px;
        font-weight: 600;
        margin-bottom: 3px;
    }

    .toggle-row-desc {
        font-size: 12.5px;
        color: var(--color-text-muted-4);
    }

    .select-wrap {
        margin-bottom: 8px;
    }

    .hint {
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted-5);
        margin: 0 0 20px;
    }

    .save-error {
        font-size: 13px;
        color: var(--color-danger);
        margin-bottom: 16px;
    }

    .save-success {
        font-size: 13px;
        color: var(--color-accent-brighter);
        margin-bottom: 16px;
    }

    .save-button {
        font-size: 14px;
        border-radius: 8px;
        padding: 13px 18px;
    }

    .billing-title {
        margin-top: 40px;
        scroll-margin-top: 90px;
    }

    .billing-status {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 18px;
    }

    .billing-status-label {
        font-family: var(--font-mono);
        font-size: 14px;
        font-weight: 600;
    }

    .billing-status-sub {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-4);
        margin-top: 3px;
    }

    .start-plan-btn {
        font-size: 13px;
        border-radius: 8px;
        padding: 10px 16px;
        white-space: nowrap;
    }

    .billing-history-label {
        margin-top: 20px;
    }

    .history-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .history-row {
        padding: 12px 0;
        border-top: 1px solid var(--color-border);
    }

    .history-main {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 3px;
    }

    .history-detail {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-text-muted-4);
        line-height: 1.5;
    }
</style>
