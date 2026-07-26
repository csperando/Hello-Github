<script setup lang="ts">
import BaseButton from '@/components/ui/BaseButton.vue'
import NavAccount from '@/components/layout/NavAccount.vue'
import { useAuthStore } from '@/stores/auth'

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
</script>

<template>
  <header
    :style="
      sticky
        ? 'position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:18px clamp(20px,4vw,48px);background:oklch(14% 0.012 250 / 0.88);backdrop-filter:blur(8px);border-bottom:1px solid oklch(100% 0 0 / 0.08);'
        : 'display:flex;align-items:center;justify-content:space-between;padding:22px clamp(20px,4vw,48px);'
    "
  >
    <RouterLink
      to="/"
      style="display:flex;align-items:center;gap:2px;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:19px;letter-spacing:-0.02em;color:oklch(96% 0.004 250);"
    >
      <span>commit</span><span style="color:oklch(72% 0.16 145);">ment</span><span style="color:oklch(72% 0.16 145);animation:blink 1.1s step-end infinite;">_</span>
    </RouterLink>

    <nav v-if="showLinks" style="display:flex;align-items:center;gap:clamp(16px,3vw,32px);font-family:'IBM Plex Mono',monospace;font-size:13.5px;">
      <slot name="links" />
      <RouterLink v-if="authStore.isAdmin" to="/admin" style="color:oklch(85% 0.006 250);">admin</RouterLink>
      <span v-if="!authStore.isLoading" style="display:flex;align-items:center;gap:10px;margin-left:8px;">
        <NavAccount v-if="authStore.isAuthenticated" />
        <BaseButton
          v-else
          variant="secondary"
          as="router-link"
          to="/signup"
          style="font-size:13.5px;color:oklch(94% 0.004 250);border:1px solid oklch(100% 0 0 / 0.18);border-radius:6px;padding:8px 14px;text-decoration:none;"
        >
          sign in
        </BaseButton>
      </span>
    </nav>
    <div v-else-if="!authStore.isLoading" style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(65% 0.01 250);">
      <NavAccount v-if="authStore.isAuthenticated" />
      <BaseButton
        v-else
        variant="secondary"
        as="router-link"
        to="/signup"
        style="font-size:13.5px;color:oklch(94% 0.004 250);border:1px solid oklch(100% 0 0 / 0.18);border-radius:6px;padding:8px 14px;text-decoration:none;"
      >
        sign in
      </BaseButton>
    </div>
  </header>
</template>
