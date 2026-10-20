<script setup lang="ts">
    import { computed, ref, watch } from "vue"

    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseTextInput from "@/components/ui/BaseTextInput.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import CharityPicker from "@/components/ui/CharityPicker.vue"
    import { getOrgById, type iOrg } from "@/services/api"
    import { updateAdminUser, type iAdminUserDetail, type iAdminUserUpdate } from "@/services/admin"
    import { errorMessage } from "@/services/errors"

    /**
     * An admin's edit of a user's account. Sends only the fields that changed.
     * `isSelf`: the admin's own account - role and account access are locked
     * (the API refuses those changes too), so nobody can lock themselves out.
     */
    const props = defineProps<{ user: iAdminUserDetail["user"]; isSelf: boolean }>()
    const emit = defineEmits<{ saved: [detail: iAdminUserDetail] }>()

    const displayName = ref("")
    const role = ref<"user" | "admin">("user")
    const isActive = ref(true)
    const charity = ref<iOrg | null>(null)
    const saving = ref(false)
    const error = ref("")
    const saved = ref(false)

    async function loadCharity(id: number | null) {
        charity.value = null
        if (!id) return
        try {
            const res = await getOrgById(id)
            if (!res.ok) return
            const body = await res.json()
            // getOrgById returns the org object when found, [] when not
            charity.value = Array.isArray(body.data) ? null : body.data
        } catch {
            // non-fatal - the picker just starts empty
        }
    }

    function reset() {
        displayName.value = props.user.display_name ?? ""
        role.value = props.user.role
        isActive.value = props.user.is_active
        error.value = ""
        loadCharity(props.user.default_charity)
    }

    watch(() => props.user, reset, { immediate: true })

    const changes = computed<iAdminUserUpdate>(() => {
        const update: iAdminUserUpdate = {}
        const name = displayName.value.trim()
        if (name && name !== (props.user.display_name ?? "")) update.display_name = name
        if (role.value !== props.user.role) update.role = role.value
        if (isActive.value !== props.user.is_active) update.is_active = isActive.value
        if (charity.value && charity.value.id !== props.user.default_charity) update.default_charity = charity.value.id
        return update
    })
    const hasChanges = computed(() => Object.keys(changes.value).length > 0)

    async function save() {
        if (!hasChanges.value) return
        error.value = ""
        saved.value = false
        saving.value = true
        try {
            const res = await updateAdminUser(props.user.id, changes.value)
            const body = await res.json().catch(() => ({}))
            if (!res.ok) {
                error.value = errorMessage(body, "Couldn't save this account.")
                return
            }
            saved.value = true
            emit("saved", body.data[0])
        } finally {
            saving.value = false
        }
    }
</script>

<template>
    <section class="card" aria-labelledby="account-title">
        <h2 id="account-title" class="card-title">Account</h2>
        <form class="fields" @submit.prevent="save">
            <div class="field">
                <label for="admin-user-name" class="field-label">display name</label>
                <BaseTextInput id="admin-user-name" v-model="displayName" clear-label="Clear display name" />
            </div>

            <div class="field">
                <label for="admin-user-role" class="field-label">role</label>
                <select id="admin-user-role" v-model="role" class="select" :disabled="isSelf">
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                </select>
            </div>

            <div class="field">
                <span class="field-label">default charity</span>
                <CharityPicker :selected="charity" @select="charity = $event" />
            </div>

            <div class="toggle-row">
                <div>
                    <div id="admin-user-active-label" class="toggle-title">account enabled</div>
                    <div class="toggle-sub">Turned off, they can't sign in. Their designs and paid paints are kept.</div>
                </div>
                <ToggleSwitch
                    data-testid="account-enabled-toggle"
                    aria-labelledby="admin-user-active-label"
                    :checked="isActive"
                    :disabled="isSelf"
                    @click="isActive = !isActive"
                />
            </div>

            <p v-if="isSelf" class="hint">This is your account - you can't change your own role or turn it off.</p>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
            <p v-else-if="saved && !hasChanges" class="saved" role="status">Saved.</p>

            <div class="actions">
                <BaseButton type="button" variant="secondary" class="secondary-btn" :disabled="!hasChanges || saving" @click="reset">discard</BaseButton>
                <BaseButton type="submit" :loading="saving" :disabled="!hasChanges || saving">save changes</BaseButton>
            </div>
        </form>
    </section>
</template>

<style scoped>
    .card {
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 20px;
        box-sizing: border-box;
    }

    .card-title {
        margin: 0 0 16px;
        font-family: var(--font-mono);
        font-size: 15px;
    }

    .fields {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .field :deep(.base-text-input-wrap) {
        margin-bottom: 0;
    }

    .field-label {
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-text-muted-3);
    }

    .select {
        min-height: 44px;
        padding: 0 12px;
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 8px;
        font: inherit;
    }

    .select:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        background: var(--color-bg-inset);
    }

    .toggle-title {
        font-weight: 600;
        font-size: 13.5px;
    }

    .toggle-sub {
        font-size: 12px;
        line-height: 1.4;
        color: var(--color-text-muted-3);
    }

    .hint {
        margin: 0;
        font-size: 12px;
        color: var(--color-text-muted-3);
    }

    .error {
        margin: 0;
        font-size: 12.5px;
        color: var(--color-danger);
    }

    .saved {
        margin: 0;
        font-size: 12.5px;
        color: var(--color-accent-bright);
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    .secondary-btn {
        background: var(--color-bg-inset);
        border: 1px solid var(--color-border-mid);
    }
</style>
