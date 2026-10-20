<script setup lang="ts">
    import { computed } from "vue"

    const props = withDefaults(
        defineProps<{
            start: number
            end: number
            /** Inclusive upper bound for end (0-indexed), e.g. 52 for a 53-week grid. */
            max?: number
            disabled?: boolean
        }>(),
        {
            max: 52,
        },
    )

    const emit = defineEmits<{
        "update:start": [value: number]
        "update:end": [value: number]
    }>()

    const rangeWidth = computed(() => props.end - props.start + 1)
    const totalWeeks = computed(() => props.max + 1)
    const fillLeftPct = computed(() => (props.start / props.max) * 100)
    const fillWidthPct = computed(() => ((props.end - props.start) / props.max) * 100)

    function onStartInput(e: Event) {
        const raw = Number((e.target as HTMLInputElement).value)
        emit("update:start", Math.max(0, Math.min(raw, props.end - 1)))
    }

    function onEndInput(e: Event) {
        const raw = Number((e.target as HTMLInputElement).value)
        emit("update:end", Math.min(props.max, Math.max(raw, props.start + 1)))
    }
</script>

<template>
    <div>
        <div class="range-label">
            <span>custom range · columns {{ start + 1 }}–{{ end + 1 }}</span>
            <span>{{ rangeWidth }} of {{ totalWeeks }}</span>
        </div>
        <div class="dual-range">
            <div class="dual-range-track"></div>
            <div class="dual-range-fill" :style="{ left: fillLeftPct + '%', width: fillWidthPct + '%' }"></div>
            <input type="range" class="range-yellow" :min="0" :max="max" step="1" :value="start" :disabled="disabled" @input="onStartInput" />
            <input type="range" class="range-yellow" :min="0" :max="max" step="1" :value="end" :disabled="disabled" @input="onEndInput" />
        </div>
    </div>
</template>

<style scoped>
    .range-label {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-warning);
        margin-bottom: 10px;
    }

    .dual-range {
        position: relative;
        height: 20px;
    }

    .dual-range-track {
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        height: 4px;
        transform: translateY(-50%);
        background: oklch(30% 0.01 250); /* no matching token - slider track fill tone */
        border-radius: 2px;
    }

    .dual-range-fill {
        position: absolute;
        top: 50%;
        height: 4px;
        transform: translateY(-50%);
        background: var(--color-warning);
        border-radius: 2px;
    }

    .dual-range input[type="range"] {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 20px;
        margin: 0;
        background: transparent;
        pointer-events: none;
        appearance: none;
        -webkit-appearance: none;
    }

    .dual-range input[type="range"]::-webkit-slider-runnable-track {
        background: transparent;
        height: 20px;
    }

    .dual-range input[type="range"]::-moz-range-track {
        background: transparent;
        height: 20px;
    }

    .dual-range input[type="range"]::-webkit-slider-thumb {
        pointer-events: auto;
        appearance: none;
        -webkit-appearance: none;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: var(--color-text);
        border: 3px solid var(--color-warning);
        cursor: pointer;
        margin-top: 2.5px;
    }

    .dual-range input[type="range"]:disabled::-webkit-slider-thumb {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .dual-range input[type="range"]:disabled::-moz-range-thumb {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .dual-range input[type="range"]::-moz-range-thumb {
        pointer-events: auto;
        width: 15px;
        height: 15px;
        border-radius: 50%;
        background: var(--color-text);
        border: 3px solid var(--color-warning);
        cursor: pointer;
    }
</style>
