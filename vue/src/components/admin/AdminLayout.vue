<script setup lang="ts">
    import AppNavbar from "@/components/layout/AppNavbar.vue"

    // the admin console's sections; each is a child route of /admin
    const sections = [
        { to: "/admin/payments", label: "payments" },
        { to: "/admin/jobs", label: "paint jobs" },
        { to: "/admin/users", label: "users" },
    ]
</script>

<template>
    <div class="page">
        <AppNavbar sticky />

        <div class="admin-body">
            <nav aria-label="Admin sections" class="admin-nav">
                <div class="admin-nav-label">admin</div>
                <div class="admin-nav-links">
                    <RouterLink v-for="s in sections" :key="s.to" :to="s.to" class="admin-nav-link" active-class="admin-nav-link--active">
                        {{ s.label }}
                    </RouterLink>
                </div>
            </nav>

            <main class="admin-main">
                <RouterView />
            </main>
        </div>
    </div>
</template>

<style scoped>
    .page {
        font-family: var(--font-sans);
        background: var(--color-bg);
        color: var(--color-text);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    /* side menu + content: the menu stacks above the content at phone width */
    .admin-body {
        flex: 1;
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
    }

    .admin-nav {
        flex: 1 1 200px;
        max-width: 240px;
        padding: 24px 16px;
        border-right: 1px solid var(--color-border);
        box-sizing: border-box;
    }

    .admin-nav-label {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-warning);
        padding: 0 12px 10px;
    }

    .admin-nav-links {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .admin-nav-link {
        display: flex;
        align-items: center;
        min-height: 44px;
        padding: 0 12px;
        border-radius: 8px;
        color: var(--color-text-muted-1);
        font-family: var(--font-mono);
        font-size: 13px;
        text-decoration: none;
    }

    .admin-nav-link:hover {
        background: var(--color-border);
    }

    .admin-nav-link--active {
        background: var(--color-accent-soft);
        color: var(--color-accent-bright);
        font-weight: 600;
    }

    .admin-main {
        flex: 999 1 560px;
        min-width: 0;
        padding: 28px clamp(16px, 3vw, 36px) 48px;
        box-sizing: border-box;
    }

    @media (max-width: 760px) {
        .admin-nav {
            max-width: none;
            border-right: none;
            border-bottom: 1px solid var(--color-border);
        }

        .admin-nav-links {
            flex-direction: row;
            flex-wrap: wrap;
        }
    }
</style>
