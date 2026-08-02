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
        font-family: var(--font-mono);
        font-weight: 600;
        font-size: 19px;
        letter-spacing: -0.02em;
        color: var(--color-text);
    }

    .ment {
        color: var(--color-accent-bright);
    }

    ._ {
        color: var(--color-accent-bright);
        animation: blink 1.1s step-end infinite;
    }


    @keyframes blink {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0; }
    }
</style>
