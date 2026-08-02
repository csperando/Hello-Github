<script setup lang="ts">
    interface iBaseButton {
        loading?: boolean
        variant?: 'primary' | 'secondary'
        as?: 'button'
        disabled?: boolean
    }

    const props = withDefaults(defineProps<iBaseButton>(), {
        loading: false,
        variant: "primary",
        as: "button",
    });

    /* 
        Leaving this here for reference later
        If multiple variants of the base button become popular during development, 
        then adding a switch here for the styles/calsses may be best
    */ 
    // import { computed } from 'vue';
    // const variantStyle = computed(() => {
    //     switch (props.variant) {
    //         case "primary": {
    //             return 'style string here';  
    //         }
    //         default: {
    //             return '';
    //         }
    //     }
    // });

</script>

<template>
    <button :class="['base flex flex-row items-center justify-center px-[30px]', variant == 'primary' ? 'primary' : 'secondary', $attrs.class]">
        <div class="absolute flex justify-center items-center left-[5px] top-[calc(50% - 7.5px)] w-[15px] h-[15px]">
            <span v-if="loading" class="loading-icon"></span>
        </div>
        <slot />
    </button>
</template>

<style scoped>
    .loading-icon {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid oklch(14% 0.03 145 / 0.35);
        border-top-color: oklch(14% 0.03 145);
        display: inline-block;
        animation:spin 0.7s linear infinite;
    }

    button.base {
        font-family: var(--font-mono);
        border-radius: 6px;
        padding-top: 8px;
        padding-bottom: 8px;
        padding-left: 30px;
        padding-right: 30px;
        font-size: 13.5px;
        text-decoration: none;
        /* width: 100%; */
    }

    button.base:hover {
        text-decoration: none;
        cursor: pointer;
    }

    .primary {
        background: var(--color-accent);
        color: var(--color-accent-on);
        border: none;
        font-weight: 600;
    }

    .secondary {
        background: transparent;
    }
</style>
