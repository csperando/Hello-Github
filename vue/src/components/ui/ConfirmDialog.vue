<script setup lang="ts">
    import { nextTick, ref, useId, watch } from "vue"

    import BaseButton from "./BaseButton.vue"

    const props = withDefaults(
        defineProps<{
            open: boolean
            title: string
            confirmLabel?: string
            cancelLabel?: string
        }>(),
        {
            confirmLabel: "confirm",
            cancelLabel: "cancel",
        },
    )

    const emit = defineEmits<{
        confirm: []
        cancel: []
    }>()

    const titleId = useId()
    const bodyId = useId()

    const panel = ref<HTMLElement | null>(null)
    const cancelButton = ref<InstanceType<typeof BaseButton> | null>(null)
    // Focus goes back to whatever opened the dialog once it closes.
    let returnFocusTo: HTMLElement | null = null

    watch(
        () => props.open,
        async (open) => {
            if (open) {
                returnFocusTo = document.activeElement as HTMLElement | null
                await nextTick()
                // the safe choice gets focus, so a stray Enter doesn't confirm
                ;(cancelButton.value?.$el as HTMLElement | undefined)?.focus()
            } else {
                returnFocusTo?.focus()
                returnFocusTo = null
            }
        },
    )

    // Escape cancels; Tab stays inside the dialog while it's open.
    function onKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.stopPropagation()
            emit("cancel")
            return
        }
        if (event.key !== "Tab" || !panel.value) return

        const focusable = [...panel.value.querySelectorAll<HTMLElement>("button")]
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
        }
    }
</script>

<template>
    <div v-if="open" class="confirm-backdrop" @click.self="emit('cancel')" @keydown="onKeydown">
        <div
            ref="panel"
            role="alertdialog"
            aria-modal="true"
            :aria-labelledby="titleId"
            :aria-describedby="bodyId"
            class="confirm-panel"
        >
            <h2 :id="titleId" class="confirm-title">{{ title }}</h2>
            <div :id="bodyId" class="confirm-body">
                <slot />
            </div>
            <div class="confirm-actions">
                <BaseButton ref="cancelButton" type="button" variant="secondary" class="confirm-cancel" @click="emit('cancel')">
                    {{ cancelLabel }}
                </BaseButton>
                <BaseButton type="button" class="confirm-confirm" @click="emit('confirm')">{{ confirmLabel }}</BaseButton>
            </div>
        </div>
    </div>
</template>

<style scoped>
    .confirm-backdrop {
        position: fixed;
        inset: 0;
        z-index: 50; /* above the sticky navbar (20) */
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: oklch(0% 0 0 / 0.55); /* pure-black scrim, not a design-system color */
    }

    .confirm-panel {
        width: 100%;
        max-width: 420px;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        padding: 24px;
        box-shadow: 0 24px 60px -20px oklch(0% 0 0 / 0.6);
    }

    .confirm-title {
        font-family: var(--font-mono);
        font-size: 15px;
        font-weight: 600;
        margin: 0 0 10px;
    }

    .confirm-body {
        font-size: 13px;
        line-height: 1.55;
        color: var(--color-text-muted-1);
        margin-bottom: 20px;
    }

    .confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .confirm-cancel {
        background: var(--color-bg-inset);
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-mid);
    }
</style>
