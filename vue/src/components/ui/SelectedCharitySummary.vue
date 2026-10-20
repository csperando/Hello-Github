<script setup lang="ts">
    import CharityListItem from "./CharityListItem.vue"
    import { charityLocation } from "@/helpers/charity"
    import type { iOrg } from "@/services/api"

    defineProps<{ charity: iOrg | null }>()
</script>

<template>
    <CharityListItem
        v-if="charity"
        size="md"
        :name="charity.name"
        :letter="charity.name.charAt(0).toUpperCase()"
        :focus="charityLocation(charity)"
        border-color="var(--color-accent-border)"
        :selected="true"
    >
        <template #trailing>
            <span class="selected-tag">selected</span>
        </template>
    </CharityListItem>
</template>

<style scoped>
    .selected-tag {
        display: inline-block;
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        color: var(--color-accent-bright);
        background: var(--color-bg-chip);
        border: 1px solid var(--color-accent-border);
        border-radius: 999px;
        padding: 2px 8px;
    }
</style>
