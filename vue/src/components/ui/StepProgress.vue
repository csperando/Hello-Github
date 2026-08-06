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

    const stepData = computed(() =>
        props.steps.map((text, i) => {
            const number = i + 1;
            const status = (i === props.current) ? "active"
                : (i < props.current) ? "complete"
                : "todo";
            
            return { number, text, status };
        }),
    )
</script>

<template>
    <div class="step-progress">
        <template v-for="(s, i) in stepData" :key="i">
            <div class="step">
                <div :class="['step-dot-label', s.status]">
                    <span class="step-dot">{{ s.number }}</span>
                    <span class="step-text">{{ s.text }}</span>
                </div>
                <span v-if="i < steps.length-1" class="step-line" :style="{ width: lineWidth }"></span>
            </div>
        </template>
    </div>
</template>

<style scoped>
    .complete>.step-dot {
        background: var(--color-accent);
        color: var(--color-accent-on);
        border: 1px solid transparent;
    }
    
    .complete>.step-text {
        color: var(--color-text);
    }
    
    .active>.step-dot {
        background: var(--color-accent-soft);
        color: var(--color-accent-bright);
        border: 1px solid var(--color-accent);
    }
    
    .active>.step-text {
        color: var(--color-text);
    }
    
    .todo>.step-dot {
        background: transparent;
        color: var(--color-text-muted-5);
        border: 1px solid var(--color-border-strong);

    }

    .todo>.step-text {
        color: var(--color-text-muted-5);
    }

    .step-progress {
        display: flex;
        align-items: center;
        justify-content: center;
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
