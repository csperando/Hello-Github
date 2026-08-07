<script setup lang="ts">
    import type { iOrg } from "@/services/api"
    import CharityListItem from "./CharityListItem.vue"
    import { charityLocation } from "@/helpers/charity"

    withDefaults(
        defineProps<{
            results: iOrg[]
            loading?: boolean
            error?: boolean
            query?: string
            selectedId?: number | null
        }>(),
        {
            loading: false,
            error: false,
            query: "",
            selectedId: null,
        },
    )

    defineEmits<{ select: [org: iOrg] }>()
</script>

<template>
    <div class="charity-results">
        <p v-if="loading" class="status-text">searching…</p>
        <p v-else-if="error" class="status-text error-text">couldn't load results, try again.</p>
        <p v-else-if="results.length === 0 && query" class="status-text">no charities found for "{{ query }}"</p>
        <ul v-else-if="results.length" class="results-list">
            <li v-for="org in results" :key="org.id">
                <CharityListItem
                    size="md"
                    :name="org.name"
                    :letter="org.name.charAt(0).toUpperCase()"
                    :focus="charityLocation(org)"
                    :border-color="org.id === selectedId ? 'var(--color-accent-border)' : 'var(--color-border)'"
                    :selected="org.id === selectedId"
                    @click="$emit('select', org)"
                />
            </li>
        </ul>
    </div>
</template>

<style scoped>
    .charity-results {
        margin-bottom: 18px;
    }

    .results-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .status-text {
        font-size: 13px;
        color: var(--color-text-muted-4);
        margin: 0;
    }

    .error-text {
        color: var(--color-danger);
    }
</style>
