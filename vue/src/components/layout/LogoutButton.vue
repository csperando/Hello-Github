<script setup lang="ts">
    import { useRouter } from "vue-router"
    import { useAuthStore } from "@/stores/auth"

    const authStore = useAuthStore();
    const router = useRouter();

    async function handleLogout() {
        await authStore.logout();
        router.push("/");
    }
</script>

<template>
    <button type="button" @click="handleLogout" class="logout-button">log out</button>
</template>

<style scoped>
    /* TODO - refactor using button component; identical to Hamburger.vue's .menu-button */
    .logout-button {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-4);
        background: transparent;
        border: 1px solid var(--color-border-mid);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
    }
</style>
