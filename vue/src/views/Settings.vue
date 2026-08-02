<script setup lang="ts">
    import { computed, ref } from "vue"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import BaseSelect from "@/components/ui/BaseSelect.vue"
    import CharityListItem from "@/components/ui/CharityListItem.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import { updateProfile } from "@/services/api"
    import { useAuthStore } from "@/stores/auth"
    import { timezoneOptions } from "@/helpers/timezone"

    interface Charity {
        name: string
        letter: string
    }

    const CHARITIES: Charity[] = [
        { name: "GiveDirectly", letter: "G" },
        { name: "Khan Academy", letter: "K" },
        { name: "EFF", letter: "E" },
        { name: "Code.org", letter: "C" },
    ]

    // authStore.user is already populated here: the router's requiresAuth guard
    // (vue/src/router/index.ts) awaits fetchMe() before this route resolves.
    const authStore = useAuthStore()

    const displayName = ref(authStore.user?.display_name ?? "")
    const charity = ref(authStore.user?.default_charity ?? "GiveDirectly")
    const publicOptIn = ref(authStore.user?.public_opt_in ?? true)
    const timezone = ref(authStore.user?.timezone ?? "UTC")
    const useRealEmail = ref(authStore.user?.use_real_email ?? false)
    const timezoneOpts = timezoneOptions()

    const saving = ref(false)
    const saveError = ref("")
    const saved = ref(false)

    function togglePublic() {
        publicOptIn.value = !publicOptIn.value
        saved.value = false
    }

    function toggleUseRealEmail() {
        useRealEmail.value = !useRealEmail.value
        saved.value = false
    }

    const charities = computed(() =>
        CHARITIES.map((c) => ({
            ...c,
            selected: c.name === charity.value,
            borderColor: c.name === charity.value ? "var(--color-accent-border)" : "var(--color-border)",
        })),
    )

    function selectCharity(name: string) {
        charity.value = name
        saved.value = false
    }

    async function save() {
        if (!authStore.user) return

        saving.value = true
        saveError.value = ""
        saved.value = false
        try {
            const res = await updateProfile(authStore.user.id, {
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
            authStore.user.display_name = displayName.value
            authStore.user.default_charity = charity.value
            authStore.user.public_opt_in = publicOptIn.value
            authStore.user.timezone = timezone.value
            authStore.user.use_real_email = useRealEmail.value
            saved.value = true
        } catch {
            saveError.value = "Something went wrong saving your profile. Please try again."
        } finally {
            saving.value = false
        }
    }
</script>

<template>
    <div class="page">

        <AppNavbar sticky />

        <main class="main">
            <div class="content">
                <div class="eyebrow">// settings</div>
                <h1 class="title">Profile settings</h1>

                <BaseCard>
                    <label class="field-label">display name</label>
                    <input v-model="displayName" @input="saved = false" placeholder="e.g. Lena Ortiz" class="text-input" />

                    <label class="field-label">default charity</label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 charity-grid">
                        <CharityListItem
                            v-for="c in charities"
                            :key="c.name"
                            size="sm"
                            :name="c.name"
                            :letter="c.letter"
                            :border-color="c.borderColor"
                            :selected="c.selected"
                            @click="selectCharity(c.name)"
                        />
                    </div>

                    <div class="toggle-row toggle-row-tall">
                        <div>
                            <div class="toggle-row-title">share to public gallery</div>
                            <div class="toggle-row-desc">let others see your design and which charity you supported</div>
                        </div>
                        <ToggleSwitch data-testid="public-opt-in-toggle" :checked="publicOptIn" @click="togglePublic" />
                    </div>

                    <label for="settings-timezone" class="field-label">timezone</label>
                    <div class="select-wrap">
                        <BaseSelect id="settings-timezone" v-model="timezone" :options="timezoneOpts" @update:model-value="saved = false" />
                    </div>
                    <p class="hint">used to schedule your commits early in your own morning, not GitHub's.</p>

                    <div class="toggle-row toggle-row-taller">
                        <div>
                            <div class="toggle-row-title">use my real GitHub email for commits</div>
                            <div class="toggle-row-desc">off (recommended) keeps your real email out of the public commit history, using a private GitHub-provided address instead</div>
                        </div>
                        <ToggleSwitch data-testid="use-real-email-toggle" :checked="useRealEmail" @click="toggleUseRealEmail" />
                    </div>

                    <div v-if="saveError" class="save-error">{{ saveError }}</div>
                    <div v-if="saved" class="save-success">Saved.</div>

                    <BaseButton @click="save" :disabled="saving" :loading="saving" full class="save-button">
                        <span v-if="saving">saving…</span>
                        <span v-else>save changes</span>
                    </BaseButton>
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
    }

    .main {
        flex: 1;
        padding: clamp(28px, 4vw, 44px) clamp(20px, 4vw, 32px) 80px;
        display: flex;
        justify-content: center;
    }

    .content {
        width: 100%;
        max-width: 560px;
    }

    .eyebrow {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-accent-bright);
        margin-bottom: 14px;
    }

    .title {
        font-family: var(--font-mono);
        font-size: clamp(22px, 3vw, 28px);
        font-weight: 700;
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

    .toggle-row-tall {
        margin-bottom: 18px;
    }

    .toggle-row-taller {
        margin-bottom: 24px;
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
        margin-bottom: 8px;
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

    .save-success {
        font-size: 13px;
        color: var(--color-accent-brighter);
        margin-bottom: 16px;
    }

    .save-button {
        font-size: 14px;
        border-radius: 8px;
        padding: 13px 18px;
    }
</style>
