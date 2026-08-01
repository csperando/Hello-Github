<template>
    <RouterLink to="/" class="link">
        <span>commit</span><span class="ment">ment</span><span class="_">_</span>
    </RouterLink>
</template>

<style scoped>
    .link {
        display: flex;
        align-items: center;
        gap: 2px;
        font-family:'IBM Plex Mono', monospace;
        font-weight: 600;
        font-size: 19px;
        letter-spacing: -0.02em;
        color: oklch(96% 0.004 250);
    }

    .ment {
        color: oklch(72% 0.16 145);
    }

    ._ {
        color: oklch(72% 0.16 145);
        animation: blink 1.1s step-end infinite;
    }
</style>
