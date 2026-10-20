<script setup lang="ts">
    import { onMounted, onUnmounted, ref } from "vue"

    import CharityResultsList from "./CharityResultsList.vue"
    import CharitySearchInput from "./CharitySearchInput.vue"
    import SelectedCharitySummary from "./SelectedCharitySummary.vue"
    import { useCharitySearch } from "@/composables/useCharitySearch"
    import type { iOrg } from "@/services/api"

    defineProps<{ selected: iOrg | null }>()

    const emit = defineEmits<{ select: [org: iOrg] }>()

    const { searchResults, searchLoading, searchError, searchQuery, handleSearch, handleCleared } = useCharitySearch()

    const searchEl = ref<HTMLElement | null>(null)
    const searchInput = ref<InstanceType<typeof CharitySearchInput> | null>(null)
    // Whether the results dropdown may show - CharityResultsList itself
    // renders nothing when there's no query/loading/error/results.
    const open = ref(false)

    function isInside(target: EventTarget | null): boolean {
        return target instanceof Node && !!searchEl.value?.contains(target)
    }

    function onSelect(org: iOrg) {
        emit("select", org)
        searchInput.value?.clear()
        open.value = false
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === "Escape" && open.value) {
            event.stopPropagation()
            open.value = false
        }
    }

    // Tabbing (or otherwise moving focus) to something outside closes it.
    // A null relatedTarget is ignored on purpose: Safari doesn't focus buttons
    // on click, so clicking a result would otherwise close the list before the
    // click lands - outside clicks are handled by onDocumentPointerdown instead.
    function onFocusout(event: FocusEvent) {
        if (event.relatedTarget && !isInside(event.relatedTarget)) open.value = false
    }

    function onDocumentPointerdown(event: PointerEvent) {
        if (!isInside(event.target)) open.value = false
    }

    onMounted(() => document.addEventListener("pointerdown", onDocumentPointerdown))
    onUnmounted(() => document.removeEventListener("pointerdown", onDocumentPointerdown))
</script>

<template>
    <div class="charity-picker">
        <SelectedCharitySummary :charity="selected" class="charity-picker__summary" />
        <slot />
        <div
            ref="searchEl"
            class="charity-picker__search"
            @focusin="open = true"
            @input="open = true"
            @focusout="onFocusout"
            @keydown="onKeydown"
        >
            <CharitySearchInput
                ref="searchInput"
                class="charity-picker__input"
                @search="handleSearch"
                @cleared="handleCleared"
            />
            <CharityResultsList
                v-if="open"
                class="charity-picker__dropdown"
                :results="searchResults"
                :loading="searchLoading"
                :error="searchError"
                :query="searchQuery"
                :selected-id="selected?.id ?? null"
                @select="onSelect"
            />
        </div>
    </div>
</template>

<style scoped>
    .charity-picker__summary {
        margin-bottom: 10px;
    }

    .charity-picker__search {
        position: relative;
        margin-bottom: 18px;
    }

    /* the dropdown hangs off the input's bottom edge, so drop BaseTextInput's own gap */
    .charity-picker__search .charity-picker__input {
        margin-bottom: 0;
    }

    .charity-picker__search .charity-picker__dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 10;
        max-height: 320px;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        box-shadow: 0 8px 24px oklch(0% 0 0 / 0.4);
    }
</style>
