<script setup lang="ts">
    import { computed, ref, useSlots } from "vue"

    const props = withDefaults(
        defineProps<{
            modelValue: string
            id?: string
            placeholder?: string
            /** Accessible name for the clear button - override for context, e.g. "Clear search". */
            clearLabel?: string
            /** "compact" matches Editor.vue's denser sidebar inputs (mono font, tighter padding). */
            variant?: "default" | "compact"
        }>(),
        {
            clearLabel: "Clear",
            variant: "default",
        },
    )

    const emit = defineEmits<{
        "update:modelValue": [value: string]
        clear: []
    }>()

    const slots = useSlots()
    const hasLeadingIcon = computed(() => !!slots["leading-icon"])
    const showClear = computed(() => props.modelValue.length > 0)

    const inputEl = ref<HTMLInputElement | null>(null)

    function onInput(event: Event) {
        emit("update:modelValue", (event.target as HTMLInputElement).value)
    }

    function onClear() {
        emit("update:modelValue", "")
        emit("clear")
        inputEl.value?.focus()
    }
</script>

<template>
    <div class="base-text-input-wrap" :class="{ 'base-text-input-wrap--compact': variant === 'compact' }">
        <span v-if="hasLeadingIcon" class="leading-icon" aria-hidden="true">
            <slot name="leading-icon" />
        </span>
        <input
            ref="inputEl"
            :id="id"
            type="text"
            class="text-input"
            :class="{
                'has-leading-icon': hasLeadingIcon,
                'has-clear': showClear,
                'text-input--compact': variant === 'compact',
            }"
            :placeholder="placeholder"
            :value="modelValue"
            @input="onInput"
        />
        <button
            v-if="showClear"
            type="button"
            class="clear-button"
            :aria-label="clearLabel"
            @click="onClear"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293z"/>
            </svg>
        </button>
    </div>
</template>

<style scoped>
    .base-text-input-wrap {
        position: relative;
        width: 100%;
        margin-bottom: 18px;
    }

    .base-text-input-wrap--compact {
        margin-bottom: 24px;
    }

    .text-input {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--font-sans);
        font-size: 14.5px;
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 8px;
        padding: 12px 14px;
        margin-bottom: 0;
    }

    .text-input.has-leading-icon {
        padding-left: 40px;
    }

    .text-input.has-clear {
        padding-right: 40px;
    }

    .text-input--compact {
        font-family: var(--font-mono);
        font-size: 13px;
        background: var(--color-bg-raised);
        border-color: var(--color-border-mid);
        padding: 10px 12px;
    }

    .text-input--compact.has-leading-icon {
        padding-left: 36px;
    }

    .text-input--compact.has-clear {
        padding-right: 36px;
    }

    .text-input::placeholder {
        color: oklch(50% 0.01 250);
    }

    .text-input:focus {
        outline: none;
        border-color: var(--color-accent) !important;
    }

    .leading-icon {
        position: absolute;
        top: 0;
        left: 0;
        width: 40px;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted-4);
        pointer-events: none;
    }

    .clear-button {
        position: absolute;
        top: 0;
        right: 0;
        width: 40px;
        height: 100%;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        padding: 0;
        color: var(--color-text-muted-4);
        cursor: pointer;
    }

    .clear-button:hover {
        color: var(--color-text);
    }

    .clear-button:focus-visible {
        outline: none;
        color: var(--color-accent);
    }
</style>
