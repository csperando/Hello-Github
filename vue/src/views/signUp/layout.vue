<script setup lang="ts">
    import { onMounted, ref } from "vue"
    import { useRoute, useRouter } from "vue-router"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import StepProgress from "@/components/ui/StepProgress.vue"
    import { useAuthStore } from "@/stores/auth"

    const STEPS = ["connect", "profile", "done"]

    const route = useRoute()
    const router = useRouter()
    const authStore = useAuthStore()

    const initializing = ref(true)
    const step = ref(0)

    onMounted(() => {
        initializing.value = false;
        
        const path = route.fullPath;
        if(path === "/signup") router.push("/signup/connect");
    });
</script>

<template>
    <div class="page">
        <AppNavbar />

        <main class="main">
            <div class="content">
                <StepProgress :steps="STEPS" :current="step" />

                <BaseCard>
                    <RouterView />
                </BaseCard>
            </div>
        </main>
    </div>
</template>

<style scoped>
    .page {
        font-family: var(--font-sans);
        background: var(--color-bg);
        color: var(--color-text);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background-image: radial-gradient(oklch(100% 0 0 / 0.045) 1px, transparent 1px); /* one-off decorative dot grid overlay - not a UI color token */
        background-size: 22px 22px;
    }

    .main {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px clamp(20px, 4vw, 48px) 60px;
    }

    .content {
        width: 100%;
        max-width: 520px;
    }
</style>
