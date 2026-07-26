<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import UserAvatarChip from '@/components/ui/UserAvatarChip.vue'

const authStore = useAuthStore()
const router = useRouter()

const displayName = computed(
  () => authStore.user?.display_name || authStore.user?.github_username || '',
)
const initial = computed(() => (displayName.value.charAt(0) || '?').toUpperCase())

const accountStatus = computed(() =>
  authStore.user?.default_charity ? `supporting ${authStore.user.default_charity}` : '',
)

async function handleLogout() {
  await authStore.logout()
  router.push('/')
}
</script>

<template>
  <div style="display:flex;align-items:center;gap:14px;">
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
      <RouterLink to="/dashboard" style="text-decoration:none;color:inherit;">
        <UserAvatarChip :initial="initial" :handle="displayName" :avatar-url="authStore.user?.avatar_url" />
      </RouterLink>
      <div
        v-if="accountStatus"
        style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:oklch(60% 0.01 250);white-space:nowrap;"
      >
        {{ accountStatus }}
      </div>
    </div>
    <button
      type="button"
      @click="handleLogout"
      style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(65% 0.01 250);background:transparent;border:1px solid oklch(100% 0 0 / 0.14);border-radius:6px;padding:6px 10px;cursor:pointer;"
    >
      log out
    </button>
  </div>
</template>
