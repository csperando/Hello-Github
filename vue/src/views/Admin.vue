<script setup lang="ts">
    import AppNavbar from "@/components/layout/AppNavbar.vue"
</script>

<template>
    <div class="page">
        <AppNavbar sticky />

        <!-- MAIN -->
        <main class="main">
            <div class="content">
                <div class="eyebrow">// admin</div>
                <h1 class="heading">Admin tools coming soon</h1>
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
    }

    .main {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px clamp(20px, 4vw, 48px) 80px;
    }

    .content {
        text-align: center;
    }

    .eyebrow {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-accent-bright);
        margin-bottom: 14px;
    }

    .heading {
        font-family: var(--font-mono);
        font-size: clamp(22px, 3vw, 30px);
        font-weight: 700;
        margin: 0;
    }
</style>
