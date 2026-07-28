<script setup lang="ts">
import BaseButton from '@/components/ui/BaseButton.vue'
import NavAccount from '@/components/layout/NavAccount.vue'
import { useAuthStore } from '@/stores/auth'
import { githubLoginUrl } from '@/services/api'

withDefaults(
  defineProps<{
    sticky?: boolean
    showLinks?: boolean
  }>(),
  {
    sticky: false,
    showLinks: false,
  },
)

const authStore = useAuthStore()

function connect() {
  window.location.href = githubLoginUrl()
}
</script>

<template>
  <header
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    :style="
      sticky
        ? 'position:sticky;top:0;z-index:20;padding:18px clamp(20px,4vw,48px);background:oklch(14% 0.012 250 / 0.88);backdrop-filter:blur(8px);border-bottom:1px solid oklch(100% 0 0 / 0.08);'
        : 'padding:22px clamp(20px,4vw,48px);'
    "
  >
    <RouterLink
      to="/"
      style="display:flex;align-items:center;gap:2px;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:19px;letter-spacing:-0.02em;color:oklch(96% 0.004 250);"
    >
      <span>commit</span><span style="color:oklch(72% 0.16 145);">ment</span><span style="color:oklch(72% 0.16 145);animation:blink 1.1s step-end infinite;">_</span>
    </RouterLink>

    <nav v-if="showLinks" class="flex flex-wrap items-center gap-4 md:gap-8" style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;">
      <template v-if="!authStore.isLoading && authStore.isAuthenticated">
        <RouterLink to="/editor" style="color:oklch(85% 0.006 250);">design</RouterLink>
        <RouterLink to="/settings" style="color:oklch(85% 0.006 250);">settings</RouterLink>
        <RouterLink v-if="authStore.isAdmin" to="/admin" style="color:oklch(85% 0.006 250);">admin</RouterLink>
      </template>
      <slot v-else name="links" />
      <span v-if="!authStore.isLoading" class="flex flex-wrap items-center gap-2.5" style="margin-left:8px;">
        <NavAccount v-if="authStore.isAuthenticated" />
        <template v-else>
          <BaseButton
            variant="secondary"
            @click="connect"
            style="font-size:13.5px;color:oklch(94% 0.004 250);border:1px solid oklch(100% 0 0 / 0.18);border-radius:6px;padding:8px 14px;"
          >
            sign in
          </BaseButton>
          <BaseButton as="router-link" to="/signup" style="font-size:13.5px;border-radius:6px;padding:9px 16px;text-decoration:none;">
            connect github →
          </BaseButton>
        </template>
      </span>
    </nav>
    <div v-else-if="!authStore.isLoading" class="flex flex-wrap items-center gap-2.5" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(65% 0.01 250);">
      <NavAccount v-if="authStore.isAuthenticated" />
      <template v-else>
        <BaseButton
          variant="secondary"
          @click="connect"
          style="font-size:13.5px;color:oklch(94% 0.004 250);border:1px solid oklch(100% 0 0 / 0.18);border-radius:6px;padding:8px 14px;"
        >
          sign in
        </BaseButton>
        <BaseButton as="router-link" to="/signup" style="font-size:13.5px;border-radius:6px;padding:9px 16px;text-decoration:none;">
          connect github →
        </BaseButton>
      </template>
    </div>
  </header>
</template>
