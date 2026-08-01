<script setup lang="ts">
    import { useRouter } from 'vue-router'
    import { useAuthStore } from '@/stores/auth'

    const authStore = useAuthStore();
    const router = useRouter();

    async function handleLogout() {
        await authStore.logout();
        router.push('/');
    }
</script>

<template>
    <button type="button" @click="handleLogout" class="logout-button">log out</button>
</template>

<style scoped>
    /* TODO - refactor using button component */
    .logout-button {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        color: oklch(65% 0.01 250);
        background: transparent;
        border: 1px solid oklch(100% 0 0 / 0.14);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
    }
</style>
