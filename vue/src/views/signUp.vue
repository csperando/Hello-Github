<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import CharityListItem from '@/components/ui/CharityListItem.vue'
import StepProgress from '@/components/ui/StepProgress.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { githubLoginUrl, updateProfile } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

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

const STEPS = ['connect', 'profile', 'done']

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const initializing = ref(true)
const step = ref(1)
const connecting = ref(false)
const saving = ref(false)
const saveError = ref('')
const displayName = ref('')
const charity = ref('GiveDirectly')
const publicOptIn = ref(true)

const ghHandle = computed(() =>
  authStore.user?.github_username ? `@${authStore.user.github_username}` : '',
)

onMounted(async () => {
  await authStore.fetchMe()

  const wantsProfileStep = route.query.step === 'profile'

  if (authStore.isAuthenticated) {
    if (!wantsProfileStep) {
      // already fully signed in and not mid-onboarding - don't show the connect screen again
      router.replace('/dashboard')
      return
    }

    displayName.value = authStore.user?.display_name ?? displayName.value
    charity.value = authStore.user?.default_charity ?? charity.value
    publicOptIn.value = authStore.user?.public_opt_in ?? publicOptIn.value
    step.value = 2
  }
  // else: stale/shared "?step=profile" link with no session - fall back to step 1 (the default)

  initializing.value = false
})

function connect() {
  connecting.value = true
  window.location.href = githubLoginUrl()
}

function togglePublic() {
  publicOptIn.value = !publicOptIn.value
}

function skip() {
  step.value = 3
}

async function finish() {
  saving.value = true
  saveError.value = ''
  try {
    const res = await updateProfile(authStore.user!.id, {
      display_name: displayName.value,
      default_charity: charity.value,
      public_opt_in: publicOptIn.value,
    })
    if (!res.ok) {
      saveError.value = 'Something went wrong saving your profile. Please try again.'
      return
    }
    step.value = 3
  } catch {
    saveError.value = 'Something went wrong saving your profile. Please try again.'
  } finally {
    saving.value = false
  }
}

const charities = computed(() =>
  CHARITIES.map((c) => ({
    ...c,
    borderColor: c.name === charity.value ? 'oklch(58% 0.16 145 / 0.7)' : 'oklch(100% 0 0 / 0.08)',
  })),
)

const firstName = computed(() => {
  const base = displayName.value || ghHandle.value.replace('@', '')
  return (base.split(' ')[0] ?? '').split('.')[0] ?? ''
})

</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;display:flex;flex-direction:column;background-image:radial-gradient(oklch(100% 0 0 / 0.045) 1px, transparent 1px);background-size:22px 22px;">

    <!-- NAV -->
    <AppNavbar />

    <!-- MAIN -->
    <main style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px clamp(20px,4vw,48px) 60px;">
      <div v-if="!initializing" style="width:100%;max-width:520px;">

        <!-- STEP PROGRESS -->
        <StepProgress :steps="STEPS" :current="step" />

        <!-- CARD -->
        <BaseCard>

          <!-- STEP 1: CONNECT GITHUB -->
          <div v-if="step === 1" style="text-align:center;">
            <div style="width:56px;height:56px;border-radius:12px;background:oklch(24% 0.02 250);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;">
              <svg width="28" height="28" viewBox="0 0 16 16" fill="oklch(94% 0.004 250)"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
            </div>
            <h1 style="font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:700;margin:0 0 10px;">Connect with GitHub</h1>
            <p style="font-size:14.5px;line-height:1.6;color:oklch(70% 0.008 250);max-width:380px;margin:0 auto 28px;">We'll use your GitHub account to push commits and render your contribution graph. We only ever request commit access — nothing else.</p>
            <BaseButton
              @click="connect"
              :disabled="connecting"
              :loading="connecting"
              full
              style="display:flex;align-items:center;justify-content:center;gap:10px;font-size:15px;border-radius:8px;padding:15px 20px;"
            >
              <span v-if="connecting">connecting…</span>
              <span v-else>connect with github →</span>
            </BaseButton>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(50% 0.01 250);margin-top:20px;">by continuing you agree to our <a href="#">terms</a> and <a href="#">privacy policy</a>.</div>
          </div>

          <!-- STEP 2: PROFILE FORM -->
          <div v-else-if="step === 2">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:26px;padding:12px 14px;background:oklch(24% 0.02 250);border-radius:10px;">
              <div style="width:36px;height:36px;border-radius:8px;background:oklch(58% 0.16 145 / 0.15);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;color:oklch(72% 0.16 145);flex:none;">✓</div>
              <div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;">GitHub connected</div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(65% 0.01 250);">{{ ghHandle }}</div>
              </div>
            </div>

            <h1 style="font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:700;margin:0 0 6px;">Set up your profile</h1>
            <p style="font-size:14px;color:oklch(68% 0.008 250);margin:0 0 24px;">Optional — you can change all of this later.</p>

            <label style="display:block;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(70% 0.01 250);margin-bottom:7px;">display name</label>
            <input v-model="displayName" placeholder="e.g. Lena Ortiz" style="width:100%;box-sizing:border-box;font-family:'IBM Plex Sans',sans-serif;font-size:14.5px;background:oklch(15% 0.012 250);color:oklch(96% 0.004 250);border:1px solid oklch(100% 0 0 / 0.12);border-radius:8px;padding:12px 14px;margin-bottom:18px;" />

            <label style="display:block;font-family:'IBM Plex Mono',monospace;font-size:12.5px;color:oklch(70% 0.01 250);margin-bottom:7px;">default charity</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
              <CharityListItem
                v-for="c in charities"
                :key="c.name"
                size="sm"
                :name="c.name"
                :letter="c.letter"
                :border-color="c.borderColor"
                @click="charity = c.name"
              />
            </div>

            <div @click="togglePublic" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px;border-radius:8px;background:oklch(15% 0.012 250);border:1px solid oklch(100% 0 0 / 0.1);margin-bottom:28px;">
              <div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;margin-bottom:3px;">share to public gallery</div>
                <div style="font-size:12.5px;color:oklch(65% 0.008 250);">let others see your design and which charity you supported</div>
              </div>
              <ToggleSwitch :checked="publicOptIn" />
            </div>

            <div v-if="saveError" style="font-size:13px;color:oklch(70% 0.19 25);margin-bottom:16px;">{{ saveError }}</div>

            <div style="display:flex;gap:12px;">
              <BaseButton variant="secondary" @click="skip" :disabled="saving" style="flex:none;font-weight:500;font-size:14px;color:oklch(80% 0.006 250);border:1px solid oklch(100% 0 0 / 0.16);border-radius:8px;padding:13px 18px;">skip for now</BaseButton>
              <BaseButton @click="finish" :disabled="saving" :loading="saving" style="flex:1;font-size:14px;border-radius:8px;padding:13px 18px;">
                <span v-if="saving">saving…</span>
                <span v-else>save & continue →</span>
              </BaseButton>
            </div>
          </div>

          <!-- STEP 3: DONE -->
          <div v-else style="text-align:center;">
            <div style="width:56px;height:56px;border-radius:50%;background:oklch(58% 0.16 145 / 0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:24px;color:oklch(72% 0.19 145);">✓</span>
            </div>
            <h1 style="font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:700;margin:0 0 10px;">You're all set, {{ firstName }}</h1>
            <p style="font-size:14.5px;line-height:1.6;color:oklch(70% 0.008 250);max-width:360px;margin:0 auto 28px;">Time to paint something worth committing to.</p>
            <BaseButton as="router-link" to="/editor" full style="font-size:15px;border-radius:8px;padding:15px 20px;text-decoration:none;">open the editor →</BaseButton>
          </div>

        </BaseCard>
      </div>
    </main>
  </div>
</template>

<style>
input::placeholder {
  color: oklch(50% 0.01 250);
}
input:focus, select:focus {
  outline: none;
  border-color: oklch(58% 0.16 145) !important;
}
</style>
