<script setup lang="ts">
    import { computed } from "vue"

    const props = withDefaults(
        defineProps<{
            steps: string[]
            current: number
            lineWidth?: string
        }>(),
        {
            lineWidth: "24px",
        },
    )

    const stepMeta = computed(() =>
        props.steps.map((label, i) => {
            const n = i + 1
            const active = n === props.current
            const complete = n < props.current
            return {
                n,
                label,
                showLine: i < props.steps.length - 1,
                dotBg: complete ? "var(--color-accent)" : active ? "var(--color-accent-soft)" : "transparent",
                dotColor: complete ? "var(--color-accent-on)" : active ? "var(--color-accent-bright)" : "var(--color-text-muted-5)",
                dotBorder: complete ? "transparent" : active ? "var(--color-accent)" : "var(--color-border-strong)",
                labelColor: active || complete ? "var(--color-text)" : "var(--color-text-muted-5)",
            }
        }),
    )
</script>

<template>
    <div class="step-progress">
        <template v-for="s in stepMeta" :key="s.n">
            <div class="step">
                <div class="step-dot-label">
                    <span
                        class="step-dot"
                        :style="{ background: s.dotBg, color: s.dotColor, border: `1px solid ${s.dotBorder}` }"
                    >{{ s.n }}</span>
                    <span :style="{ color: s.labelColor }">{{ s.label }}</span>
                </div>
                <span v-if="s.showLine" class="step-line" :style="{ width: lineWidth }"></span>
            </div>
        </template>
    </div>
</template>

<style scoped>
    .step-progress {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 32px;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-5);
    }

    .step {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .step-dot-label {
        display: flex;
        align-items: center;
        gap: 7px;
    }

    .step-dot {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
    }

    .step-line {
        height: 1px;
        background: var(--color-border-mid);
        display: inline-block;
    }
</style>
