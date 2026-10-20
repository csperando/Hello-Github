<script setup lang="ts">
    import { formatDate } from "@/helpers/format"
    import type { iHistoryEntry } from "@/services/admin"

    /** A record's history, newest first: admin changes (with who made them) and its own events. */
    defineProps<{ entries: iHistoryEntry[] }>()
</script>

<template>
    <section class="history" aria-label="History">
        <h3 class="history-title">history</h3>
        <p v-if="entries.length === 0" class="history-empty">nothing yet.</p>
        <ol v-else class="history-list">
            <li v-for="(entry, i) in entries" :key="i" class="history-entry">
                <span>{{ entry.what }}</span>
                <span class="history-meta">{{ formatDate(entry.when) }}<template v-if="entry.by"> · @{{ entry.by }}</template></span>
            </li>
        </ol>
    </section>
</template>

<style scoped>
    .history {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--color-border);
    }

    .history-title {
        margin: 0 0 10px;
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-muted-3);
    }

    .history-empty {
        margin: 0;
        font-size: 12.5px;
        color: var(--color-text-muted-4);
    }

    .history-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 12.5px;
    }

    .history-entry {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .history-meta {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-text-muted-4);
    }
</style>
