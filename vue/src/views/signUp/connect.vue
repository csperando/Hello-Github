<script setup lang="ts">
    import { onMounted, ref } from "vue"
    import { useRoute, useRouter } from "vue-router"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import { githubLoginUrl } from "@/services/api"
    import { useAuthStore } from "@/stores/auth"

    const route = useRoute()
    const router = useRouter()
    const authStore = useAuthStore()

    const connecting = ref(false)

    onMounted(async () => {
        await authStore.fetchMe()

        // already fully signed in and not mid-onboarding - don't show the
        // connect screen again (a stale "?step=profile" link with no session
        // just falls through and shows the connect button)
        if (authStore.isAuthenticated && route.query.step !== "profile") {
            router.replace("/dashboard")
        }
    })

    function connect() {
        connecting.value = true
        window.location.href = githubLoginUrl()
    }
</script>

<template>
    <div class="step-centered">
        <div class="connect-icon">
            <svg width="28" height="28" viewBox="0 0 16 16" fill="var(--color-text)">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
            </svg>
        </div>
        
        <h1 class="step1-title">Connect with GitHub</h1>
        
        <p class="step1-copy">We'll use your GitHub account to push commits and render your contribution graph. We only ever request commit access — nothing else.</p>
        
        <div class="flex flex-row items-center justify-center">
            <BaseButton
                @click="connect"
                :disabled="connecting"
                :loading="connecting"
                full
                class="connect-button">
                <span v-if="connecting">connecting…</span>
                <span v-else>connect with github →</span>
            </BaseButton>
        </div>

        <div class="legal-line">
            by continuing you agree to our
            <!-- TODO: no /terms or /privacy route/content exists yet - wire these up once legal copy exists -->
            <a href="#">terms</a> and <a href="#">privacy policy</a>.
        </div>
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

    .step-centered {
        text-align: center;
    }

    .connect-icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        background: var(--color-bg-chip);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 22px;
    }

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

    .connect-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        font-size: 15px;
        border-radius: 8px;
        padding: 15px 20px;
    }

    .legal-line {
        font-family: var(--font-mono);
        font-size: 12px;
        color: oklch(50% 0.01 250); /* darker than every muted-text token (muted-5 is 60%) - no token fits, left raw */
        margin-top: 20px;
    }

    .connected-banner {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 26px;
        padding: 12px 14px;
        background: var(--color-bg-chip);
        border-radius: 10px;
    }

    .connected-check {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: var(--color-accent-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-weight: 700;
        color: var(--color-accent-bright);
        flex: none;
    }

    .connected-title {
        font-family: var(--font-mono);
        font-size: 13.5px;
        font-weight: 600;
    }

    .connected-handle {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-4);
    }

    .step2-title {
        font-family: var(--font-mono);
        font-size: 20px;
        font-weight: 700;
        margin: 0 0 6px;
    }

    .step2-subtitle {
        font-size: 14px;
        color: var(--color-text-muted-3); /* was oklch(68% 0.008 250) - between muted-2 and muted-3, nearest is muted-3 */
        margin: 0 0 24px;
    }

    .field-label {
        display: block;
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-3);
        margin-bottom: 7px;
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
        margin-bottom: 18px;
    }

    .charity-grid {
        margin-bottom: 20px;
    }

    .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px;
        border-radius: 8px;
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border-mid);
    }

    .toggle-row-wide {
        margin-bottom: 28px;
    }

    .toggle-row-title {
        font-family: var(--font-mono);
        font-size: 13.5px;
        font-weight: 600;
        margin-bottom: 3px;
    }

    .toggle-row-desc {
        font-size: 12.5px;
        color: var(--color-text-muted-4);
    }

    .select-wrap {
        margin-bottom: 18px;
    }

    .hint {
        font-size: 12px;
        line-height: 1.5;
        color: var(--color-text-muted-5);
        margin: 0 0 20px;
    }

    .save-error {
        font-size: 13px;
        color: var(--color-danger);
        margin-bottom: 16px;
    }

    .step2-actions {
        display: flex;
        gap: 12px;
    }

    .skip-button {
        flex: none;
        font-weight: 500;
        font-size: 14px;
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-strong); /* was oklch(100% 0 0 / 0.16) - nearest token is border-strong (0.18) */
        border-radius: 8px;
        padding: 13px 18px;
    }

    .continue-button {
        flex: 1;
        font-size: 14px;
        border-radius: 8px;
        padding: 13px 18px;
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

<style>
    input::placeholder {
        color: oklch(50% 0.01 250); /* same literal as .legal-line above - darker than every muted-text token, no token fits */
    }
    input:focus, select:focus {
        outline: none;
        border-color: var(--color-accent) !important;
    }
</style>
