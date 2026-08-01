<script setup lang="ts">
    import Commitment from '@/components/layout/Commitment.vue';
    import BaseButton from '@/components/ui/BaseButton.vue'
    import NavAccount from '@/components/layout/NavAccount.vue'

    import { useAuthStore } from '@/stores/auth'
    import { githubLoginUrl } from '@/services/api'
    import AccountButton from '@/components/layout/AccountButton.vue';
    import Hamburger from '@/components/layout/Hamburger.vue';
    import LogoutButton from '@/components/layout/LogoutButton.vue';
    import { ref } from 'vue';

    const props = defineProps({
        sticky: { type: Boolean, default: true },
    });

    const showNav = ref(false);
    const toggleNav = function() {
        showNav.value = !showNav.value;
    }

    const authStore = useAuthStore();

    function connect() {
        window.location.href = githubLoginUrl();
    }
</script>

<template>
    <!-- mobile navbar -->
    <header 
        :class='["flex md:hidden lg:hidden flex-col flex-wrap items-center justify-between gap-x-4 gap-y-2"
        , sticky ? "header-sticky" : "header-not-sticky"]' >

        <div class="w-full flex flex-row items-center justify-between">
            <Commitment />

            <div class="flex flex-row items-center justify-between">
                <Hamburger @click="toggleNav"/>
            </div>
        </div>
        
        <nav v-if="showNav" class="flex flex-col flex-wrap items-center gap-4 md:gap-8" > 
            <template v-if="!authStore.isLoading && authStore.isAuthenticated">
                <AccountButton />
                <RouterLink to="/editor" class="nav-link">design</RouterLink>
                <RouterLink to="/settings" class="nav-link">settings</RouterLink>
                <RouterLink v-if="authStore.isAdmin" to="/admin" class="nav-link">admin</RouterLink>
                <LogoutButton />
            </template>

            <template v-else>
                <a href="#how" class="nav-link">how it works</a>
                <a href="#give" class="nav-link">pricing</a>
                <a href="#community" class="nav-link">community</a>
                <BaseButton variant="secondary" @click="connect" class="button-dark">sign in</BaseButton>
                <BaseButton as="router-link" to="/signup" class="button-green"> connect github →</BaseButton>
            </template>
        </nav>
    </header>

    <!-- desktop navbar -->
    <header 
        :class='["hidden md:flex lg:flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2"
        , sticky ? "header-sticky" : "header-not-sticky"]' >

        <Commitment />

        <nav class="flex flex-wrap items-center gap-4 md:gap-8 nav">
            <template v-if="!authStore.isLoading && authStore.isAuthenticated">
                <RouterLink to="/editor" class="nav-link">design</RouterLink>
                <RouterLink to="/settings" class="nav-link">settings</RouterLink>
                <RouterLink v-if="authStore.isAdmin" to="/admin" class="nav-link">admin</RouterLink>
            </template>

            <template v-else>
                <a href="#how" class="nav-link">how it works</a>
                <a href="#give" class="nav-link">pricing</a>
                <a href="#community" class="nav-link">community</a>
            </template>
            
            <span v-if="!authStore.isLoading" class="flex flex-wrap items-center gap-2.5">
                <NavAccount v-if="authStore.isAuthenticated" />
                <template v-else>
                    <BaseButton variant="secondary" @click="connect" class="button-dark">sign in</BaseButton>
                    <BaseButton as="router-link" to="/signup" class="button-green"> connect github →</BaseButton>
                </template>
            </span>
        </nav>
    </header>
</template>

<style scoped>
    .header-sticky {
        position: sticky;
        top: 0;
        z-index: 20;
        padding: 18px clamp(20px, 4vw, 48px);
        background: oklch(14% 0.012 250 / 0.88);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid oklch(100% 0 0 / 0.08);
    }

    .header-not-sticky {
        padding:22px clamp(20px,4vw,48px);
    }

    .nav {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 13.5px;
    }

    .nav-link {
        color: oklch(85% 0.006 250);
    }

    /* TODO - refactor button styles in button component */
    .button-dark {
        font-size: 13.5px;
        color: oklch(94% 0.004 250);
        border: 1px solid oklch(100% 0 0 / 0.18);
        border-radius: 6px;
        padding: 8px 14px;
    }

    .button-green {
        font-size: 13.5px;
        border-radius: 6px;
        padding: 9px 16px;
        text-decoration:none;
    }

</style>
