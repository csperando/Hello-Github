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
    />
</template>
