<template>
    <div class="menu-button w-[32px] h-[32px]">
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="currentColor" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/>
        </svg>
    </div>
</template>

<style scoped>
    .menu-button {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        color: oklch(65% 0.01 250);
        background: transparent;
        border: 1px solid oklch(100% 0 0 / 0.14);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
    }
</style>
