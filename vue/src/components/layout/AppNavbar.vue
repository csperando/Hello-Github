<script setup lang="ts">
    import Commitment from "@/components/layout/Commitment.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import NavAccount from "@/components/layout/NavAccount.vue"

    import { useAuthStore } from "@/stores/auth"
    import { githubLoginUrl } from "@/services/api"
    import AccountButton from "@/components/layout/AccountButton.vue"
    import Hamburger from "@/components/layout/Hamburger.vue"
    import LogoutButton from "@/components/layout/LogoutButton.vue"
    import { ref } from "vue"

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
        data-testid="mobile-nav"
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
                <RouterLink to="/#how" class="nav-link">how it works</RouterLink>
                <RouterLink to="/#give" class="nav-link">pricing</RouterLink>
                <RouterLink to="/#community" class="nav-link">community</RouterLink>
                <BaseButton variant="secondary" @click="connect" class="button-dark">sign in</BaseButton>
                <RouterLink to="/signup">
                    <BaseButton class="button-green"> connect github →</BaseButton>
                </RouterLink>
            </template>
        </nav>
    </header>
    
    <!-- desktop navbar -->
    <header
        data-testid="desktop-nav"
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
                <RouterLink to="/#how" class="nav-link">how it works</RouterLink>
                <RouterLink to="/#give" class="nav-link">pricing</RouterLink>
                <RouterLink to="/#community" class="nav-link">community</RouterLink>
            </template>
            
            <span v-if="!authStore.isLoading" class="flex flex-wrap items-center gap-2.5">
                <NavAccount v-if="authStore.isAuthenticated" />
                <template v-else>
                    <BaseButton variant="secondary" @click="connect" class="button-dark">sign in</BaseButton>
                    <RouterLink to="/signup">
                        <BaseButton class="button-green"> connect github →</BaseButton>
                    </RouterLink>
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
        background: oklch(14% 0.012 250 / 0.88); /* var(--color-bg) at 88% alpha - no matching token, blur backdrop needs a distinct alpha */
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--color-border);
    }

    .header-not-sticky {
        padding: 22px clamp(20px, 4vw, 48px);
    }

    .nav {
        font-family: var(--font-mono);
        font-size: 13.5px;
    }

    .nav-link {
        color: var(--color-text-muted-1);
    }

    .nav-link:hover {
        text-decoration: underline;
    }

    /*
        TODO - maybe?
        if this "dark" style becomes repeated, then
        refactor as a variant in the base button component
    */
    .button-dark {
        color: var(--color-text);
        border: 1px solid var(--color-border-strong);
    }

</style>
