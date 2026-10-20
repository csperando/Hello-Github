<script setup lang="ts">
    import { onMounted, onUnmounted, ref, watch } from "vue"

    import BaseTextInput from "@/components/ui/BaseTextInput.vue"
    import StatusChip from "@/components/admin/StatusChip.vue"
    import { debounce } from "@/helpers/debounce"
    import { formatCents, formatDate } from "@/helpers/format"
    import { listAdminUsers, type iAdminUserSummary } from "@/services/admin"

    const search = ref("")
    const users = ref<iAdminUserSummary[]>([])
    const loading = ref(false)
    const loadError = ref("")

    async function load() {
        loading.value = true
        loadError.value = ""
        try {
            const res = await listAdminUsers(search.value.trim())
            if (!res.ok) {
                loadError.value = "Couldn't load users."
                return
            }
            users.value = (await res.json()).data ?? []
        } catch {
            loadError.value = "Couldn't load users."
        } finally {
            loading.value = false
        }
    }

    const debouncedLoad = debounce(load, 300)
    watch(search, () => debouncedLoad())
    onMounted(load)
    onUnmounted(() => debouncedLoad.cancel())
</script>

<template>
    <div>
        <h1 class="title">Users</h1>

        <div role="search" class="search">
            <label for="users-search" class="field-label">search</label>
            <BaseTextInput id="users-search" v-model="search" placeholder="username, name or email" clear-label="Clear search">
                <template #leading-icon>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                </template>
            </BaseTextInput>
        </div>

        <section aria-label="Users" class="table-card">
            <p v-if="loadError" class="table-message table-message--error" role="alert">{{ loadError }}</p>
            <p v-else-if="loading && users.length === 0" class="table-message">loading…</p>
            <p v-else-if="users.length === 0" class="table-message">no users match.</p>
            <table v-else class="table">
                <thead>
                    <tr>
                        <th scope="col">user</th>
                        <th scope="col">role</th>
                        <th scope="col" class="num">contributed</th>
                        <th scope="col">joined</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="u in users" :key="u.id" data-testid="user-row">
                        <td>
                            <RouterLink :to="`/admin/users/${u.id}`" class="user-link">@{{ u.github_username }}</RouterLink>
                            <div class="muted small">{{ u.display_name }}<template v-if="u.display_name && u.email"> · </template>{{ u.email }}</div>
                        </td>
                        <td>
                            <StatusChip :label="u.role" :tone="u.role === 'admin' ? 'warn' : 'neutral'" />
                            <StatusChip v-if="!u.is_active" label="disabled" tone="bad" class="chip-gap" />
                        </td>
                        <td class="mono strong num">{{ formatCents(u.contributed_cents) }}</td>
                        <td class="mono small muted nowrap">{{ formatDate(u.created_at) }}</td>
                    </tr>
                </tbody>
            </table>
        </section>
    </div>
</template>

<style scoped>
    .title {
        margin: 0 0 20px;
        font-family: var(--font-mono);
        font-size: 26px;
        font-weight: 700;
    }

    .search {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-width: 420px;
        margin-bottom: 16px;
    }

    .search :deep(.base-text-input-wrap) {
        margin-bottom: 0;
    }

    .field-label {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-text-muted-3);
    }

    .table-card {
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        overflow-x: auto;
    }

    .table {
        width: 100%;
        min-width: 560px;
        border-collapse: collapse;
        font-size: 13.5px;
    }

    .table th {
        text-align: left;
        padding: 12px 16px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 500;
        color: var(--color-text-muted-3);
    }

    .table td {
        padding: 12px 16px;
        border-top: 1px solid var(--color-border);
    }

    .user-link {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        font-weight: 600;
        color: var(--color-accent-bright);
    }

    .chip-gap {
        margin-left: 6px;
    }

    .num {
        text-align: right;
    }

    .mono {
        font-family: var(--font-mono);
    }

    .strong {
        font-weight: 600;
    }

    .muted {
        color: var(--color-text-muted-2);
    }

    .small {
        font-size: 12.5px;
    }

    .nowrap {
        white-space: nowrap;
    }

    .table-message {
        margin: 0;
        padding: 20px 16px;
        color: var(--color-text-muted-3);
    }

    .table-message--error {
        color: var(--color-danger);
    }
</style>
