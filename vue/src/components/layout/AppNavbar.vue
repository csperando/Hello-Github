<script setup lang="ts">
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
      <span style="display:flex;align-items:center;gap:10px;margin-left:8px;">
        <slot name="actions" />
      </span>
    </nav>
    <div v-else style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(65% 0.01 250);">
      <slot name="actions" />
    </div>
  </header>
</template>
