<script setup lang="ts">
defineProps<{
  initial: string
  handle: string
  avatarUrl?: string
}>()
</script>

<template>
  <div style="display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border:1px solid oklch(100% 0 0 / 0.14);border-radius:20px;">
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      :alt="handle"
      style="width:22px;height:22px;border-radius:50%;object-fit:cover;"
    />
    <span v-else style="width:22px;height:22px;border-radius:50%;background:oklch(58% 0.16 145 / 0.2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:oklch(72% 0.16 145);">{{ initial }}</span>
    <span style="font-size:12.5px;color:oklch(85% 0.006 250);">{{ handle }}</span>
  </div>
</template>
