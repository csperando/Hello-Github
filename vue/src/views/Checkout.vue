<script setup lang="ts">
    import { computed, ref } from "vue"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import CharityListItem from "@/components/ui/CharityListItem.vue"
    import StepProgress from "@/components/ui/StepProgress.vue"
    import ContributionGridPreview from "@/components/ui/ContributionGridPreview.vue"
    import { LEVEL_COLORS } from "@/helpers/grid"

    interface Charity {
        name: string
        focus: string
        letter: string
    }

    const CHARITIES: Charity[] = [
        { name: "GiveDirectly", focus: "Cash transfers to families in poverty", letter: "G" },
        { name: "Khan Academy", focus: "Free education for anyone, anywhere", letter: "K" },
        { name: "EFF", focus: "Defending digital rights & privacy", letter: "E" },
        { name: "The Trevor Project", focus: "Crisis support for LGBTQ+ youth", letter: "T" },
        { name: "Rainforest Trust", focus: "Protecting critical habitats", letter: "R" },
        { name: "Code.org", focus: "Computer science education for kids", letter: "C" },
        { name: "World Central Kitchen", focus: "Meals in disaster & crisis zones", letter: "W" },
        { name: "Direct Relief", focus: "Medical aid to under-resourced communities", letter: "D" },
    ]

    const HEART_MINI = [
        [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    ]

    function buildPreviewGrid(): number[] {
        const weeks = 24
        const days = 7
        const grid = new Array(weeks * days).fill(0)
        for (let i = 0; i < grid.length; i++) {
            if (Math.random() < 0.2) grid[i] = 1 + Math.floor(Math.random() * 2)
        }
        const startWeek = 7
        HEART_MINI.forEach((row, r) => {
            row.forEach((filled, c) => {
                if (filled) {
                    const week = startWeek + c
                    const idx = week * days + r
                    if (idx < grid.length) grid[idx] = 3 + ((r + c) % 2)
                }
            })
        })
        return grid
    }

    const PRESETS = [10, 25, 50, 100]

    const step = ref(1)
    const search = ref("")
    const selectedCharity = ref("GiveDirectly")
    const amount = ref(10)
    const paying = ref(false)
    const previewGrid = ref<number[]>(buildPreviewGrid())
    const designName = ref("my first design")

    function pay() {
        paying.value = true
        setTimeout(() => {
            paying.value = false
            step.value = 3
        }, 1100)
    }

    const filtered = computed(() => CHARITIES.filter((c) => c.name.toLowerCase().includes(search.value.toLowerCase())))

    const charities = computed(() =>
        filtered.value.map((c) => ({
            ...c,
            selected: c.name === selectedCharity.value,
            borderColor: c.name === selectedCharity.value ? "var(--color-accent-border)" : "var(--color-border)",
        })),
    )

    const noResults = computed(() => filtered.value.length === 0)

    const presets = computed(() =>
        PRESETS.map((value) => ({
            value,
            bg: value === amount.value ? "var(--color-accent)" : "var(--color-bg-inset)",
            color: value === amount.value ? "var(--color-accent-on)" : "var(--color-text-muted-1)",
            border: value === amount.value ? "transparent" : "var(--color-border-mid)",
        })),
    )

    const donationAmount = computed(() => Math.max(0, amount.value - 3))
    const previewCells = computed(() => previewGrid.value.map((level) => ({ bg: LEVEL_COLORS[level] ?? LEVEL_COLORS[0]! })))
    const paintedCount = computed(() => previewGrid.value.filter((l) => l > 0).length)
</script>

<template>
    <div class="page">

        <AppNavbar sticky />

        <main class="main">

            <StepProgress :steps="['charity', 'payment', 'done']" :current="step" line-width="32px" />

            <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] items-start gap-8">

                <!-- STEP CONTENT -->
                <BaseCard padding="clamp(24px,3vw,36px)" class="step-card">

                    <!-- STEP 1: CHARITY -->
                    <div v-if="step === 1">
                        <h1 class="step-title">Choose a charity</h1>
                        <p class="step-subtitle">100% of your contribution beyond the flat fee goes here.</p>

                        <input v-model="search" placeholder="search 501(c)(3) organizations…" class="search-input" />

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 charity-grid">
                            <CharityListItem
                                v-for="charity in charities"
                                :key="charity.name"
                                size="md"
                                :name="charity.name"
                                :letter="charity.letter"
                                :focus="charity.focus"
                                :border-color="charity.borderColor"
                                :selected="charity.selected"
                                @click="selectedCharity = charity.name"
                            />
                        </div>
                        <div v-if="noResults" class="no-results">no matches — you can enter an EIN or org name at payment time instead.</div>

                        <div class="actions-end">
                            <BaseButton @click="step = 2" class="continue-btn">continue →</BaseButton>
                        </div>
                    </div>

                    <!-- STEP 2: AMOUNT + PAYMENT -->
                    <div v-else-if="step === 2">
                        <h1 class="step-title">Set your contribution</h1>
                        <p class="amount-subtitle">Giving to <span class="charity-name-accent">{{ selectedCharity }}</span>.</p>

                        <div class="preset-row">
                            <button
                                v-for="preset in presets"
                                :key="preset.value"
                                @click="amount = preset.value"
                                class="preset-btn"
                                :style="{ background: preset.bg, color: preset.color, border: `1px solid ${preset.border}` }"
                            >${{ preset.value }}</button>
                        </div>

                        <div class="amount-display">${{ amount }}</div>
                        <input type="range" min="3" max="150" step="1" v-model.number="amount" class="amount-range" />

                        <div class="fee-box">
                            <div class="fee-row"><span class="fee-label">flat fee (covers costs)</span><span>$3</span></div>
                            <div class="fee-row fee-row-last"><span class="fee-label">goes to {{ selectedCharity }}</span><span class="fee-value-accent">${{ donationAmount }}</span></div>
                        </div>

                        <label class="field-label">card number</label>
                        <input value="4242 4242 4242 4242" readonly class="readonly-input card-number-input" />
                        <div class="exp-cvc-row">
                            <input value="08 / 28" readonly class="readonly-input" />
                            <input value="•••" readonly class="readonly-input" />
                        </div>

                        <div class="actions-between">
                            <BaseButton variant="secondary" @click="step = 1" class="secondary-btn">back</BaseButton>
                            <BaseButton
                                @click="pay"
                                :disabled="paying"
                                :loading="paying"
                                class="continue-btn pay-btn"
                            >
                                <span v-if="paying">processing…</span>
                                <span v-else>commit & donate ${{ amount }} →</span>
                            </BaseButton>
                        </div>
                    </div>

                    <!-- STEP 3: RECEIPT -->
                    <div v-else class="receipt-step">
                        <div class="check-circle">
                            <span class="check-mark">✓</span>
                        </div>
                        <h1 class="receipt-title">Commit pushed. Donation sent.</h1>
                        <p class="receipt-message">Your design is on its way to your GitHub profile — it can take a few minutes to appear.</p>

                        <div class="receipt-box">
                            <div class="receipt-row"><span class="fee-label">design</span><span class="receipt-value">{{ designName }}</span></div>
                            <div class="receipt-row"><span class="fee-label">charity</span><span class="receipt-value">{{ selectedCharity }}</span></div>
                            <div class="receipt-row receipt-row-last"><span class="fee-label">total charged</span><span class="receipt-value-accent">${{ amount }}</span></div>
                        </div>

                        <div class="receipt-actions">
                            <BaseButton variant="secondary" class="secondary-btn flex-1">download receipt</BaseButton>
                            <BaseButton class="receipt-primary-btn flex-1">view on github →</BaseButton>
                        </div>
                    </div>

                </BaseCard>

                <!-- ORDER SUMMARY -->
                <aside class="lg:sticky lg:top-24">
                    <BaseCard padding="22px">
                        <div class="summary-label">your design</div>
                        <div class="preview-box">
                            <ContributionGridPreview :cells="previewCells" />
                        </div>
                        <div class="summary-design-name">{{ designName }}</div>
                        <div class="design-meta">{{ paintedCount }} squares · 2026</div>

                        <div class="summary-divider">
                            <div class="summary-row"><span>charity</span><span class="summary-value">{{ selectedCharity }}</span></div>
                            <div class="summary-row summary-row-last"><span>total</span><span class="summary-value-strong">${{ amount }}</span></div>
                        </div>
                    </BaseCard>
                </aside>
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
        max-width: 1140px;
        margin: 0 auto;
        padding: clamp(28px, 4vw, 48px) clamp(20px, 4vw, 32px) 80px;
    }

    .step-card {
        min-width: 0;
    }

    .step-title {
        font-family: var(--font-mono);
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 6px;
    }

    .step-subtitle {
        font-size: 14px;
        color: var(--color-text-muted-3);
        margin: 0 0 22px;
    }

    .search-input {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--font-sans);
        font-size: 14px;
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 8px;
        padding: 12px 14px;
        margin-bottom: 20px;
    }

    .charity-grid {
        margin-bottom: 24px;
    }

    .no-results {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-5);
        margin-bottom: 24px;
    }

    .actions-end {
        display: flex;
        justify-content: flex-end;
    }

    .actions-between {
        display: flex;
        justify-content: space-between;
    }

    .continue-btn {
        font-size: 14px;
        border-radius: 8px;
        padding: 13px 22px;
    }

    .pay-btn {
        display: flex;
        align-items: center;
        gap: 9px;
    }

    .amount-subtitle {
        font-size: 14px;
        color: var(--color-text-muted-3);
        margin: 0 0 24px;
    }

    .charity-name-accent {
        color: var(--color-accent-bright);
    }

    .preset-row {
        display: flex;
        gap: 10px;
        margin-bottom: 18px;
        flex-wrap: wrap;
    }

    .preset-btn {
        font-family: var(--font-mono);
        font-weight: 600;
        font-size: 13.5px;
        border-radius: 8px;
        padding: 10px 16px;
        cursor: pointer;
    }

    .amount-display {
        font-family: var(--font-mono);
        font-size: 38px;
        font-weight: 700;
        margin-bottom: 12px;
    }

    .amount-range {
        width: 100%;
        margin-bottom: 22px;
    }

    .fee-box {
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 26px;
    }

    .fee-row {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 13px;
        margin-bottom: 8px;
    }

    .fee-row-last {
        margin-bottom: 0;
    }

    .fee-label {
        color: var(--color-text-muted-4);
    }

    .fee-value-accent {
        color: var(--color-accent-bright);
        font-weight: 600;
    }

    .field-label {
        display: block;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-3);
        margin-bottom: 7px;
    }

    .readonly-input {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--font-mono);
        font-size: 13.5px;
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 8px;
        padding: 12px 14px;
    }

    .card-number-input {
        margin-bottom: 14px;
    }

    .exp-cvc-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 26px;
    }

    .secondary-btn {
        font-weight: 500;
        font-size: 14px;
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-strong);
        border-radius: 8px;
        padding: 13px 18px;
    }

    .flex-1 {
        flex: 1;
    }

    .receipt-step {
        text-align: center;
        padding: 12px 0 4px;
    }

    .check-circle {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--color-accent-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 22px;
    }

    .check-mark {
        font-family: var(--font-mono);
        font-size: 24px;
        color: var(--color-accent-brighter);
    }

    .receipt-title {
        font-family: var(--font-mono);
        font-size: 21px;
        font-weight: 700;
        margin: 0 0 8px;
    }

    .receipt-message {
        font-size: 14px;
        line-height: 1.6;
        color: var(--color-text-muted-3);
        max-width: 400px;
        margin: 0 auto 28px;
    }

    .receipt-box {
        text-align: left;
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        padding: 18px 20px;
        margin-bottom: 24px;
    }

    .receipt-row {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 13px;
        margin-bottom: 10px;
    }

    .receipt-row-last {
        margin-bottom: 0;
    }

    .receipt-value {
        font-weight: 600;
    }

    .receipt-value-accent {
        font-weight: 600;
        color: var(--color-accent-bright);
    }

    .receipt-actions {
        display: flex;
        gap: 12px;
    }

    .receipt-primary-btn {
        font-size: 14px;
        border-radius: 8px;
        padding: 13px 18px;
    }

    .summary-label {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-5);
        letter-spacing: 0.04em;
        margin-bottom: 12px;
    }

    .preview-box {
        background: var(--color-bg-inset);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
    }

    .summary-design-name {
        font-family: var(--font-mono);
        font-size: 13.5px;
        font-weight: 600;
        margin-bottom: 4px;
    }

    .design-meta {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-5);
        margin-bottom: 20px;
    }

    .summary-divider {
        border-top: 1px solid var(--color-border);
        padding-top: 16px;
    }

    .summary-row {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-5);
        margin-bottom: 8px;
    }

    .summary-row-last {
        margin-bottom: 0;
    }

    .summary-value {
        color: var(--color-text);
    }

    .summary-value-strong {
        color: var(--color-text);
        font-weight: 600;
    }
</style>
