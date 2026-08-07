<script setup lang="ts">
    import { onUnmounted, ref, watch } from "vue"

    import BaseTextInput from "./BaseTextInput.vue"
    import { debounce } from "@/helpers/debounce"

    const MIN_CHARS = 3
    const DEBOUNCE_MS = 300

    const emit = defineEmits<{
        search: [query: string]
        cleared: []
    }>()

    const query = ref("")

    const debouncedSearch = debounce((trimmed: string) => {
        emit("search", trimmed)
    }, DEBOUNCE_MS)

    watch(query, (value) => {
        const trimmed = value.trim()
        if (trimmed.length >= MIN_CHARS) {
            debouncedSearch(trimmed)
        } else {
            debouncedSearch.cancel()
            emit("cleared")
        }
    })

    onUnmounted(() => {
        debouncedSearch.cancel()
    })
</script>

<template>
    <BaseTextInput
        v-model="query"
        placeholder="search for a charity"
        clear-label="Clear search"
    >
        <template #leading-icon>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" stroke="white" fill="white" viewBox="0 0 16 16">
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/>
            </svg>
        </template>
    </BaseTextInput>
</template>
