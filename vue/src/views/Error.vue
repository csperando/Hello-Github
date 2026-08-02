<script setup lang="ts">
    import { computed, ref, watch } from "vue"
    import { useRouter } from "vue-router"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import ContributionGridPreview from "@/components/ui/ContributionGridPreview.vue"
    import { LEVEL_COLORS } from "@/helpers/grid"

    type ErrorTypeKey = "404" | "500" | "github_disconnected"

    const props = withDefaults(
        defineProps<{
            errorType?: ErrorTypeKey
        }>(),
        {
            errorType: "404",
        },
    )

    // Intentional per-error-type red gradient, anchored to --color-danger but not
    // identical to it - kept local rather than tokenized further.
    const RED_LEVEL_COLORS = [
        "oklch(24% 0.01 250)",
        "oklch(35% 0.1 25)",
        "oklch(45% 0.15 25)",
        "oklch(55% 0.19 25)",
        "oklch(65% 0.2 25)",
    ]

    type Pattern = number[][]

    const QUESTION_MARK: Pattern = [
        [0, 1, 1, 1, 0],
        [1, 0, 0, 1, 1],
        [0, 0, 1, 1, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 0, 0],
    ]

    const EXCLAIM: Pattern = [
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 1, 1, 0],
    ]

    interface ErrorSpec {
        eyebrow: string
        code: string
        codeColor: string
        title: string
        message: string
        primaryAction: string
        showDetails: boolean
        errorDetails?: string
        pattern: Pattern
        level: number
        startWeek: number
        noiseChance: number
        colors: string[]
    }

    const ERROR_TYPES: Record<ErrorTypeKey, ErrorSpec> = {
        "404": {
            eyebrow: "page not found",
            code: "404",
            codeColor: "var(--color-accent-bright)",
            title: "This grid square doesn't exist.",
            message: "The page you're looking for was moved, deleted, or never committed in the first place.",
            primaryAction: "browse designs →",
            showDetails: false,
            pattern: QUESTION_MARK,
            level: 4,
            startWeek: 11,
            noiseChance: 0.16,
            colors: LEVEL_COLORS,
        },
        "500": {
            eyebrow: "server error",
            code: "500",
            codeColor: "oklch(65% 0.2 25)", // matches RED_LEVEL_COLORS[4] - see --color-danger for the tokenized equivalent
            title: "Something broke on our end.",
            message: "Our servers hit a snag pushing your commits. Your design and payment are safe — try again in a moment.",
            primaryAction: "try again",
            showDetails: true,
            errorDetails: "Error 500: internal_server_error\nRequest ID: req_8f21c9a\nTimestamp: 2026-07-10T14:22:01Z",
            pattern: EXCLAIM,
            level: 4,
            startWeek: 12,
            noiseChance: 0.22,
            colors: RED_LEVEL_COLORS,
        },
        github_disconnected: {
            eyebrow: "connection lost",
            code: "502",
            codeColor: "oklch(75% 0.14 85)",
            title: "Lost connection to GitHub.",
            message: "We couldn't reach GitHub to push your commits. Reconnect your account and we'll pick up right where you left off.",
            primaryAction: "reconnect github →",
            showDetails: false,
            pattern: EXCLAIM,
            level: 3,
            startWeek: 12,
            noiseChance: 0.14,
            colors: LEVEL_COLORS,
        },
    }

    function buildGlitchGrid(spec: ErrorSpec): { bg: string }[] {
        const weeks = 28
        const days = 7
        const grid = new Array(weeks * days).fill(0)
        for (let i = 0; i < grid.length; i++) {
            if (Math.random() < spec.noiseChance) grid[i] = 1 + Math.floor(Math.random() * (spec.colors.length - 2))
        }
        spec.pattern.forEach((row, r) => {
            row.forEach((filled, c) => {
                if (filled) {
                    const week = spec.startWeek + c
                    const idx = week * days + r
                    if (idx >= 0 && idx < grid.length) grid[idx] = spec.level
                }
            })
        })
        return grid.map((l) => ({ bg: spec.colors[l] ?? spec.colors[0]! }))
    }

    const type = computed(() => ERROR_TYPES[props.errorType] ?? ERROR_TYPES["404"])
    const glitchCells = ref<{ bg: string }[]>(buildGlitchGrid(type.value))

    function regenerate() {
        glitchCells.value = buildGlitchGrid(type.value)
    }

    watch(type, regenerate)

    const router = useRouter()

    function onPrimaryAction() {
        if (props.errorType === "404") {
            router.push("/dashboard")
        } else if (props.errorType === "github_disconnected") {
            router.push("/signup")
        } else {
            regenerate()
        }
    }
</script>

<template>
    <div class="page">
        <AppNavbar sticky />

        <!-- MAIN -->
        <main class="main">
            <div class="content">
                <div class="eyebrow">// {{ type.eyebrow }}</div>

                <div class="code" :style="{ color: type.codeColor }">{{ type.code }}</div>

                <h1 class="title">{{ type.title }}</h1>
                <p class="message">{{ type.message }}</p>

                <!-- CONTRIBUTION GRID GLITCH ART -->
                <BaseCard padding="22px 20px" class="grid-card">
                    <ContributionGridPreview :cells="glitchCells" :weeks="28" />
                </BaseCard>

                <div class="actions">
                    <BaseButton class="primary-action" @click="onPrimaryAction">{{ type.primaryAction }}</BaseButton>
                    <RouterLink to="/"><BaseButton variant="secondary" class="back-home">back home</BaseButton></RouterLink>
                </div>

                <div v-if="type.showDetails" class="details">
                    <div class="details-label">error details</div>
                    <div class="details-body">{{ type.errorDetails }}</div>
                </div>

                <!-- TODO: no support contact route/channel exists yet - wire this up once one exists -->
                <div class="support">still stuck? <a href="#">contact support</a></div>
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
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px clamp(20px, 4vw, 48px) 80px;
        background-image: radial-gradient(oklch(100% 0 0 / 0.045) 1px, transparent 1px);
        background-size: 22px 22px;
    }

    .content {
        width: 100%;
        max-width: 640px;
        text-align: center;
    }

    .eyebrow {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-accent-bright);
        margin-bottom: 22px;
    }

    .code {
        font-family: var(--font-mono);
        font-weight: 700;
        font-size: clamp(64px, 10vw, 110px);
        line-height: 1;
        letter-spacing: -0.02em;
        margin-bottom: 8px;
        animation: flicker 4s ease-in-out infinite;
    }

    .title {
        font-family: var(--font-mono);
        font-size: clamp(20px, 2.6vw, 26px);
        font-weight: 600;
        margin: 0 0 14px;
    }

    .message {
        font-size: 15px;
        line-height: 1.65;
        color: var(--color-text-muted-2);
        max-width: 460px;
        margin: 0 auto 34px;
    }

    .grid-card {
        margin: 0 auto 34px;
        max-width: 460px;
    }

    .actions {
        display: flex;
        gap: 14px;
        justify-content: center;
        flex-wrap: wrap;
    }

    .primary-action {
        font-size: 14px;
        border-radius: 8px;
        padding: 13px 22px;
    }

    .back-home {
        font-weight: 500;
        font-size: 14px;
        color: var(--color-text);
        border: 1px solid var(--color-border-strong);
        border-radius: 8px;
        padding: 13px 22px;
    }

    .details {
        margin-top: 32px;
        text-align: left;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        padding: 16px 18px;
    }

    .details-label {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-text-muted-5);
        margin-bottom: 8px;
    }

    .details-body {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-3);
        line-height: 1.6;
        white-space: pre-wrap;
    }

    .support {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-5);
        margin-top: 28px;
    }
</style>
