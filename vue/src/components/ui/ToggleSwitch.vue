<script setup lang="ts">
    defineProps<{
        checked: boolean
        disabled?: boolean
    }>()
</script>

<template>
    <button
        type="button"
        role="switch"
        :aria-checked="checked"
        :disabled="disabled"
        :class="['toggle-track', checked ? 'is-checked' : '', disabled ? 'is-disabled' : '']"
    >
        <span :class="['toggle-knob', checked ? 'is-checked' : '']"></span>
    </button>
</template>

<style scoped>
    .toggle-track {
        flex: none;
        width: 38px;
        height: 22px;
        border-radius: 11px;
        background: var(--color-border-mid);
        position: relative;
        border: none;
        padding: 0;
        cursor: pointer;
    }

    .toggle-track.is-checked {
        background: var(--color-accent);
    }

    .toggle-track.is-disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .toggle-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--color-text);
        transition: left 0.15s;
    }

    .toggle-knob.is-checked {
        left: 18px;
    }
</style>
