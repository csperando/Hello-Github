<script setup lang="ts">
    import { computed, onMounted, ref } from "vue"
    import { useRoute, useRouter } from "vue-router"
    
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseSelect from "@/components/ui/BaseSelect.vue"
    import CharityListItem from "@/components/ui/CharityListItem.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import { githubLoginUrl, updateProfile } from "@/services/api"
    import { useAuthStore } from "@/stores/auth"
    import { timezoneOptions, detectTimezone } from "@/helpers/timezone"

    interface Charity {
        name: string
        letter: string
    }

    const CHARITIES: Charity[] = [
        { name: "GiveDirectly", letter: "G" },
        { name: "Khan Academy", letter: "K" },
        { name: "EFF", letter: "E" },
        { name: "Code.org", letter: "C" },
    ];

    const route = useRoute()
    const router = useRouter()
    const authStore = useAuthStore()

    const connecting = ref(false)
    const saving = ref(false)
    const saveError = ref("")
    const displayName = ref("")
    const charity = ref("GiveDirectly")
    const publicOptIn = ref(true)
    const timezone = ref(detectTimezone())
    const useRealEmail = ref(false)
    const timezoneOpts = timezoneOptions()

    const ghHandle = computed(() =>
        authStore.user?.github_username ? `${authStore.user.github_username}` : "",
    );

    const ghAvatar = computed(() =>
        authStore.user?.avatar_url ? `@${authStore.user.avatar_url}` : "/favicon-32.png",
    );

    onMounted(async () => {
        await authStore.fetchMe()

        const wantsProfileStep = route.query.step === "profile"

        if (authStore.isAuthenticated) {
            if (!wantsProfileStep) {
                // already fully signed in and not mid-onboarding - don't show the connect screen again
                router.replace("/dashboard")
                return
            }

            displayName.value = authStore.user?.github_username || "";
        }
        // else: stale/shared "?step=profile" link with no session - fall back to step 1 (the default)

    });

    function connect() {
        connecting.value = true
        window.location.href = githubLoginUrl()
    }

    function togglePublic() {
        publicOptIn.value = !publicOptIn.value
    }

    function toggleUseRealEmail() {
        useRealEmail.value = !useRealEmail.value
    }

    function skip() {
        step.value = 3
    }

    async function finish() {
        saving.value = true
        saveError.value = ""
        try {
            const res = await updateProfile(authStore.user!.id, {
                display_name: displayName.value,
                default_charity: charity.value,
                public_opt_in: publicOptIn.value,
                timezone: timezone.value,
                use_real_email: useRealEmail.value,
            })
            if (!res.ok) {
                saveError.value = "Something went wrong saving your profile. Please try again."
                return
            }
            step.value = 3
        } catch {
            saveError.value = "Something went wrong saving your profile. Please try again."
        } finally {
            saving.value = false
        }
    }

    const charities = computed(() =>
        CHARITIES.map((c) => ({
            ...c,
            selected: c.name === charity.value,
            borderColor: c.name === charity.value ? "var(--color-accent-border)" : "var(--color-border)",
        })),
    )

    const firstName = computed(() => {
        const base = displayName.value || ghHandle.value.replace("@", "")
        return (base.split(" ")[0] ?? "").split(".")[0] ?? ""
    })
</script>

<template>
    <div>
        <div class="connected-banner">
            <div class="connected-check">✓</div>
            <div>
                <div class="connected-title">GitHub connected</div>
                <div class="connected-handle">{{ ghHandle }}</div>
            </div>
        </div>

        <div class="flex flex-row items-start justify-between">
            <div class="flex flex-col items-start justify-start">
                <h1 class="step2-title">Set up your profile</h1>
                <p class="step2-subtitle">Optional — you can change all of this later.</p>
            </div>

            <!-- todo - edit and hover actions -->
            <div class="chip">
                <img
                    :src="ghAvatar"
                    alt="your public profile image"
                    class="avatar"
                    width="50px"
                    height="50px"
                />
            </div>
        </div>

        <label class="field-label">display name</label>
        <input v-model="displayName" placeholder="your public username" class="text-input" />
        
        <!-- todo - add filter inputs here for orgs' state, etc. -->
        <label class="field-label">default charity</label>
        <input placeholder="search for a charity" class="text-input" />
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 charity-grid">
            <CharityListItem
                v-for="c in charities"
                :key="c.name"
                size="sm"
                :name="c.name"
                :letter="c.letter"
                :border-color="c.borderColor"
                :selected="c.selected"
                @click="charity = c.name"
            />
        </div>

        <div class="toggle-row toggle-row-wide">
            <div>
                <div class="toggle-row-title">share to public gallery</div>
                <div class="toggle-row-desc">let others see your design and which charity you supported</div>
            </div>
            <ToggleSwitch :checked="publicOptIn" @click="togglePublic" />
        </div>

        <label for="signup-timezone" class="field-label">timezone</label>
        <div class="select-wrap">
            <BaseSelect id="signup-timezone" v-model="timezone" :options="timezoneOpts" />
        </div>
        <p class="hint">used to schedule your commits early in your own morning, not GitHub's.</p>

        <div class="toggle-row toggle-row-wide gap-2">
            <div>
                <div class="toggle-row-title">use my real GitHub email for commits</div>
                <div class="toggle-row-desc">off (recommended) keeps your real email out of the public commit history, using a private GitHub-provided address instead</div>
            </div>
            <ToggleSwitch data-testid="use-real-email-toggle" :checked="useRealEmail" @click="toggleUseRealEmail" />
        </div>

        <div v-if="saveError" class="save-error">{{ saveError }}</div>

        <div class="step2-actions">
            <BaseButton variant="secondary" @click="skip" :disabled="saving" class="skip-button">skip for now</BaseButton>
            <BaseButton @click="finish" :disabled="saving" :loading="saving" class="continue-button">
                <span v-if="saving">saving…</span>
                <span v-else>save & continue →</span>
            </BaseButton>
        </div>
    </div>
</template>

<style scoped>
    .chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        border: 1px solid var(--color-border-mid);
        border-radius: 20px;
    }

    .chip:hover {
        filter: brightness(1.3);
        cursor: pointer;
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
