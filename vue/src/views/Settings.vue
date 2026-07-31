<script setup lang="ts">
import { computed, ref } from 'vue'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import CharityListItem from '@/components/ui/CharityListItem.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { updateProfile } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { timezoneOptions } from '@/helpers/timezone'

interface Charity {
  name: string
  letter: string
}

const CHARITIES: Charity[] = [
  { name: 'GiveDirectly', letter: 'G' },
  { name: 'Khan Academy', letter: 'K' },
  { name: 'EFF', letter: 'E' },
  { name: 'Code.org', letter: 'C' },
]

// authStore.user is already populated here: the router's requiresAuth guard
// (vue/src/router/index.ts) awaits fetchMe() before this route resolves.
const authStore = useAuthStore()

const displayName = ref(authStore.user?.display_name ?? '')
const charity = ref(authStore.user?.default_charity ?? 'GiveDirectly')
const publicOptIn = ref(authStore.user?.public_opt_in ?? true)
const timezone = ref(authStore.user?.timezone ?? 'UTC')
const useRealEmail = ref(authStore.user?.use_real_email ?? false)
const timezoneOpts = timezoneOptions()

const saving = ref(false)
const saveError = ref('')
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
    borderColor: c.name === charity.value ? 'oklch(58% 0.16 145 / 0.7)' : 'oklch(100% 0 0 / 0.08)',
  })),
)

function selectCharity(name: string) {
  charity.value = name
  saved.value = false
}

async function save() {
  if (!authStore.user) return

  saving.value = true
  saveError.value = ''
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
      saveError.value = 'Something went wrong saving your profile. Please try again.'
      return
    }
    authStore.user.display_name = displayName.value
    authStore.user.default_charity = charity.value
    authStore.user.public_opt_in = publicOptIn.value
    authStore.user.timezone = timezone.value
    authStore.user.use_real_email = useRealEmail.value
    saved.value = true
  } catch {
    saveError.value = 'Something went wrong saving your profile. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;display:flex;flex-direction:column;">

    <AppNavbar sticky show-links />

    <main style="flex:1;padding:clamp(28px,4vw,44px) clamp(20px,4vw,32px) 80px;display:flex;justify-content:center;">
      <div style="width:100%;max-width:560px;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:14px;">// settings</div>
        <h1 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(22px,3vw,28px);font-weight:700;margin:0 0 24px;">Profile settings</h1>

        <BaseCard>
          <label style="display:block;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(70% 0.01 250);margin-bottom:7px;">display name</label>
          <input v-model="displayName" @input="saved = false" placeholder="e.g. Lena Ortiz" style="width:100%;box-sizing:border-box;font-family:'IBM Plex Sans',sans-serif;font-size:14.5px;background:oklch(15% 0.012 250);color:oklch(96% 0.004 250);border:1px solid oklch(100% 0 0 / 0.12);border-radius:8px;padding:12px 14px;margin-bottom:18px;" />

          <label style="display:block;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(70% 0.01 250);margin-bottom:7px;">default charity</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5" style="margin-bottom:20px;">
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

          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:8px;background:oklch(15% 0.012 250);border:1px solid oklch(100% 0 0 / 0.1);margin-bottom:18px;">
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;margin-bottom:3px;">share to public gallery</div>
              <div style="font-size:12.5px;color:oklch(65% 0.008 250);">let others see your design and which charity you supported</div>
            </div>
            <ToggleSwitch data-testid="public-opt-in-toggle" :checked="publicOptIn" @click="togglePublic" />
          </div>

          <label for="settings-timezone" style="display:block;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(70% 0.01 250);margin-bottom:7px;">timezone</label>
          <div style="margin-bottom:8px;">
            <BaseSelect id="settings-timezone" v-model="timezone" :options="timezoneOpts" @update:model-value="saved = false" />
          </div>
          <p style="font-size:12px;line-height:1.5;color:oklch(60% 0.008 250);margin:0 0 20px;">used to schedule your commits early in your own morning, not GitHub's.</p>

          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:8px;background:oklch(15% 0.012 250);border:1px solid oklch(100% 0 0 / 0.1);margin-bottom:24px;">
            <div>
              <div style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;margin-bottom:3px;">use my real GitHub email for commits</div>
              <div style="font-size:12.5px;color:oklch(65% 0.008 250);">off (recommended) keeps your real email out of the public commit history, using a private GitHub-provided address instead</div>
            </div>
            <ToggleSwitch data-testid="use-real-email-toggle" :checked="useRealEmail" @click="toggleUseRealEmail" />
          </div>

          <div v-if="saveError" style="font-size:13px;color:oklch(70% 0.19 25);margin-bottom:16px;">{{ saveError }}</div>
          <div v-if="saved" style="font-size:13px;color:oklch(72% 0.19 145);margin-bottom:16px;">Saved.</div>

          <BaseButton @click="save" :disabled="saving" :loading="saving" full style="font-size:14px;border-radius:8px;padding:13px 18px;">
            <span v-if="saving">saving…</span>
            <span v-else>save changes</span>
          </BaseButton>
        </BaseCard>
      </div>
    </main>

  </div>
</template>
