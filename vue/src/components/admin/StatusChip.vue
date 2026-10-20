<script setup lang="ts">
    /** A small rounded status label. Tones differ in lightness as well as hue, so they read apart without color. */
    withDefaults(
        defineProps<{
            label: string
            tone?: "good" | "warn" | "bad" | "neutral"
        }>(),
        {
            tone: "neutral",
        },
    )
</script>

<template>
    <span class="status-chip" :class="`status-chip--${tone}`">{{ label }}</span>
</template>

<style scoped>
    .status-chip {
        display: inline-block;
        padding: 3px 9px;
        border-radius: 999px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 600;
        white-space: nowrap;
    }

    .status-chip--good {
        background: var(--color-accent-soft);
        color: var(--color-accent-bright);
    }

    .status-chip--warn {
        background: oklch(80% 0.16 90 / 0.14); /* --color-warning wash - no alpha-suffix support for CSS vars */
        color: var(--color-warning);
    }

    .status-chip--bad {
        background: oklch(70% 0.19 25 / 0.15); /* --color-danger wash */
        color: var(--color-danger);
    }

    .status-chip--neutral {
        background: var(--color-border);
        color: var(--color-text-muted-2);
    }
</style>
