<script setup lang="ts">
    import { onMounted, ref } from "vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import { useAuthStore } from "@/stores/auth"

    const authStore = useAuthStore()
    const displayName = ref("")

    onMounted(async () => {
        await authStore.fetchMe()
        if (authStore.isAuthenticated) displayName.value = authStore.user?.display_name || "";
    });
</script>

<template>
    <div class="text-center">
        <div class="done-icon">
            <span class="done-check">✓</span>
        </div>
        <h1 class="step1-title">
            You're all set
            <span v-if="displayName">, {{ displayName }}</span>
        </h1>
        <p class="step1-copy">Time to paint something worth committing to.</p>
        <div class="flex flex-row items-center justify-center">
            <RouterLink to="/editor">
                <BaseButton full class="editor-button">open the editor →</BaseButton>
            </RouterLink>
        </div>
    </div>
</template>

<style scoped>
    .step1-title {
        font-family: var(--font-mono);
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 10px;
    }

    .step1-copy {
        font-size: 14.5px;
        line-height: 1.6;
        color: var(--color-text-muted-3);
        max-width: 380px;
        margin: 0 auto 28px;
    }

    .done-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--color-accent-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 22px;
    }

    .done-check {
        font-family: var(--font-mono);
        font-size: 24px;
        color: var(--color-accent-brighter);
    }

    .editor-button {
        font-size: 15px;
        border-radius: 8px;
        padding: 15px 20px;
        text-decoration: none;
    }
</style>
