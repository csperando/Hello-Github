<script setup lang="ts">
    withDefaults(
        defineProps<{
            swatchSize?: number
        }>(),
        {
            swatchSize: 10,
        },
    )
</script>

<template>
    <div class="legend">
        <span>less</span>
        <span
            v-for="level in 5"
            :key="level"
            aria-hidden="true"
            class="swatch"
            :class="`level-${level - 1}`"
            :style="{ width: `${swatchSize}px`, height: `${swatchSize}px` }"
        ></span>
        <span>more</span>
        <slot />
    </div>
</template>

<style scoped>
    .legend {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-text-muted-5);
    }

    .swatch {
        border-radius: 2px;
        display: inline-block;
    }

    .level-0 {
        background: var(--color-grid-0);
    }

    .level-1 {
        background: var(--color-grid-1);
    }

    .level-2 {
        background: var(--color-grid-2);
    }

    .level-3 {
        background: var(--color-grid-3);
    }

    .level-4 {
        background: var(--color-grid-4);
    }
</style>
