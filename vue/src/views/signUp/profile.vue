<script setup lang="ts">
    import { computed, onMounted, ref } from "vue"
    import { useRouter } from "vue-router"

    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseSelect from "@/components/ui/BaseSelect.vue"
    import BaseTextInput from "@/components/ui/BaseTextInput.vue"
    import CharityResultsList from "@/components/ui/CharityResultsList.vue"
    import CharitySearchInput from "@/components/ui/CharitySearchInput.vue"
    import GitConfigPreview from "@/components/ui/GitConfigPreview.vue"
    import SelectedCharitySummary from "@/components/ui/SelectedCharitySummary.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import { githubLoginUrl, updateProfile } from "@/services/api"
    import type { iOrg } from "@/services/api"
    import { useAuthStore } from "@/stores/auth"
    import { timezoneOptions, detectTimezone } from "@/helpers/timezone"
    import { useCharitySearch } from "@/composables/useCharitySearch"

    // featured-charities section commented out for now (see profile.vue's
    // template) - was a hardcoded, name-keyed list that predates real charity
    // search and conflicted with it; revisit once there's a real API-backed
    // featured-charities source.
    // interface Charity {
    //     name: string
    //     letter: string
    // }
    //
    // const CHARITIES: Charity[] = [
    //     { name: "Mesa County SAR", letter: "M" },
    //     { name: "World Wildlife Foundation", letter: "W" },
    //     { name: "Khan Academy", letter: "K" },
    //     { name: "The Red Cross", letter: "R" },
    //     { name: "Code.org", letter: "C" },
    // ];

    const router = useRouter()
    const authStore = useAuthStore()

    const saving = ref(false)
    const saveError = ref("")
    const displayName = ref(authStore.user?.github_username ?? "")
    const publicOptIn = ref(true)
    const timezone = ref(detectTimezone())
    const useRealEmail = ref(false)
    const timezoneOpts = timezoneOptions()

    const selectedSearchCharity = ref<iOrg | null>(null)
    const {
        searchResults,
        searchLoading,
        searchError,
        searchQuery,
        handleSearch: handleCharitySearch,
        handleCleared: handleCharitySearchCleared,
    } = useCharitySearch()

    function handleCharitySearchSelect(org: iOrg) {
        selectedSearchCharity.value = org
    }

    const ghHandle = computed(() =>
        authStore.user?.github_username ? `${authStore.user.github_username}` : "",
    );

    const ghAvatar = computed(() =>
        authStore.user?.avatar_url ? `${authStore.user.avatar_url}` : "/favicon-32.png",
    );

    onMounted(async () => {
        await authStore.fetchMe()
    });

    function togglePublic() {
        publicOptIn.value = !publicOptIn.value
    }

    function toggleUseRealEmail() {
        useRealEmail.value = !useRealEmail.value
    }

    const effectiveEmail = computed(() =>
        useRealEmail.value ? (authStore.user?.github_email ?? "") : (authStore.user?.github_noreply_email ?? ""),
    )

    // const charities = computed(() =>
    //     CHARITIES.map((c) => ({
    //         ...c,
    //         selected: c.name === charity.value,
    //         borderColor: c.name === charity.value ? "var(--color-accent-border)" : "var(--color-border)",
    //     })),
    // );

    function skip() {
        router.push("/signup/done")
    }

    async function saveAndContinue() {
        if (!authStore.user) return

        saving.value = true
        saveError.value = ""
        try {
            const res = await updateProfile(authStore.user.id, {
                display_name: displayName.value,
                default_charity: selectedSearchCharity.value?.id,
                public_opt_in: publicOptIn.value,
                timezone: timezone.value,
                use_real_email: useRealEmail.value,
            })
            if (!res.ok) {
                saveError.value = "Something went wrong saving your profile. Please try again."
                return
            }
            authStore.user.display_name = displayName.value
            authStore.user.default_charity = selectedSearchCharity.value?.id
            authStore.user.public_opt_in = publicOptIn.value
            authStore.user.timezone = timezone.value
            authStore.user.use_real_email = useRealEmail.value
            router.push("/signup/done")
        } catch {
            saveError.value = "Something went wrong saving your profile. Please try again."
        } finally {
            saving.value = false
        }
    }
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
                <div class="edit-avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 16 16">
                        <path d="M.102 2.223A3.004 3.004 0 0 0 3.78 5.897l6.341 6.252A3.003 3.003 0 0 0 13 16a3 3 0 1 0-.851-5.878L5.897 3.781A3.004 3.004 0 0 0 2.223.1l2.141 2.142L4 4l-1.757.364zm13.37 9.019.528.026.287.445.445.287.026.529L15 13l-.242.471-.026.529-.445.287-.287.445-.529.026L13 15l-.471-.242-.529-.026-.287-.445-.445-.287-.026-.529L11 13l.242-.471.026-.529.445-.287.287-.445.529-.026L13 11z"/>
                    </svg>
                </div>
            </div>
        </div>

        <label class="field-label" for="profile-display-name">display name</label>
        <BaseTextInput id="profile-display-name" v-model="displayName" placeholder="your public username" />
        
        <!-- todo - add filter inputs here for orgs' state, etc. -->
        <label class="field-label">select a charity</label>

        <SelectedCharitySummary :charity="selectedSearchCharity" />
        <CharitySearchInput @search="handleCharitySearch" @cleared="handleCharitySearchCleared" />
        <CharityResultsList
            :results="searchResults"
            :loading="searchLoading"
            :error="searchError"
            :query="searchQuery"
            :selected-id="selectedSearchCharity?.id ?? null"
            @select="handleCharitySearchSelect"
            v-show="searchResults.length"
        />

        <!--
        featured charities - commented out for now, see the matching note in
        the script block. Revisit once there's a real API-backed source for
        these instead of a hardcoded, name-keyed list.

        <label class="field-label">featured charities</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 charity-grid">
            <CharityListItem
                v-for="(c, i) in charities.slice(1, 5)"
                :key="c.name"
                size="sm"
                :name="c.name"
                :letter="c.letter"
                :border-color="c.borderColor"
                :selected="c.selected"
                @click="charity = c.name"
            />
        </div>
        -->

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

        <div class="toggle-row flex-col items-start justify-start">
            <div class="flex flex-row justify-center items-center gap-2">
                <div>
                    <div class="toggle-row-title">use my real GitHub email for commits</div>
                    <div class="toggle-row-desc">off (recommended) keeps your real email out of the public commit history, using a private GitHub-provided address instead</div>
                </div>
                <ToggleSwitch data-testid="use-real-email-toggle" :checked="useRealEmail" @click="toggleUseRealEmail" />
            </div>

            <div class="overflow-hidden">
                <div class="git-config-preview">
                    <div class="line">git config --global user.name "{{ ghHandle }}"</div>
                    <div class="line">git config --global user.email "{{ effectiveEmail }}"</div>
                </div>
            </div>
        </div>


        <div v-if="saveError" class="save-error">{{ saveError }}</div>

        <div class="step2-actions">
            <BaseButton @click="skip" variant="secondary" :disabled="saving" class="skip-button">skip for now</BaseButton>
            <BaseButton @click="saveAndContinue" :disabled="saving" :loading="saving" class="continue-button">
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

        .edit-avatar {
            opacity: 100%;
        }
    }

    .chip > img {
        border-radius: 50%;
    }

    .edit-avatar {
        position: absolute;
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        right: 5px;
        bottom: 5px;
        width: 24px;
        height: 24px;
        padding: 4px;
        border-radius: 50%;
        background-color: grey;
        opacity: 0%;
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
        /* white-space: pre; */
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
