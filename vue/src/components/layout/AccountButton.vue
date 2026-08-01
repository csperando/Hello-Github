<script setup lang="ts">
    import { computed } from 'vue'
    import { useAuthStore } from '@/stores/auth'
    import UserAvatarChip from '@/components/ui/UserAvatarChip.vue'

    const authStore = useAuthStore();

    const displayName = computed(() => {
        return authStore.user?.display_name || authStore.user?.github_username || '';
    });

    const initial = computed(() => (displayName.value.charAt(0) || '?').toUpperCase());
</script>

<template>
    <div class="flex flex-col items-end gap-[3px]">
        <RouterLink to="/dashboard" class="no-underline">
            <UserAvatarChip :initial="initial" :handle="displayName" :avatar-url="authStore.user?.avatar_url" />
        </RouterLink>
    </div>
</template>
