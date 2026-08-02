<script setup lang="ts">
    defineProps<{
        initial: string
        handle: string
        avatarUrl?: string
    }>()
</script>

<template>
    <div class="chip">
        <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="handle"
            class="avatar"
        />
        <span v-else class="avatar avatar-fallback">{{ initial }}</span>
        <span class="handle">{{ handle }}</span>
    </div>
</template>

<style scoped>
    .chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px 6px 6px;
        border: 1px solid var(--color-border-mid);
        border-radius: 20px;
    }

    .avatar {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        object-fit: cover;
    }

    .avatar-fallback {
        background: var(--color-accent-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: var(--color-accent-bright);
    }

    .handle {
        font-size: 12.5px;
        color: var(--color-text-muted-1);
    }
</style>
