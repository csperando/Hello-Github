<script setup lang="ts">
    defineProps<{
        username: string
        email: string
    }>()
</script>

<template>
    <div class="git-config-preview">
        <div class="line">git config --global user.name "{{ username }}"</div>
        <div class="line">git config --global user.email "{{ email }}"</div>
    </div>
</template>

<style scoped>
    .git-config-preview {
        font-family: var(--font-mono);
        font-size: 12px;
        line-height: 1.7;
        color: var(--color-text-muted-3);
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border-mid);
        border-radius: 8px;
        padding: 10px 14px;
        margin: 10px 0 24px;
        overflow-x: auto;
        white-space: pre;
    }
</style>
