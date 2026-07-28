<script setup lang="ts">
import AppNavbar from '@/components/layout/AppNavbar.vue'
</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;display:flex;flex-direction:column;">

    <AppNavbar sticky show-links />

    <!-- MAIN -->
    <main style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px clamp(20px,4vw,48px) 80px;">
      <div style="text-align:center;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:14px;">// admin</div>
        <h1 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(22px,3vw,30px);font-weight:700;margin:0;">Admin tools coming soon</h1>
      </div>
    </main>

  </div>
</template>
