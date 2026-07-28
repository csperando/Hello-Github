export const ROLES = ["admin", "user"] as const;
export type Role = typeof ROLES[number];

export interface iUser {
    id: String; // uuid

    github_id: Number;
    github_username: String;
    github_email?: String;
    github_node_id?: Number;
    github_profile_url?: String;
    avatar_url?: String;

    email?: String;
    name?: String;
    bio?: String;

    role?: Role;
    is_active?: Boolean;

    access_token?: String;
    refresh_token?: String;
    token_expires_at?: String;
    scope?: String;

    created_at?: String;
    updated_at?: String;
    last_login_at?: String;
}

/**
 * The subset of a user row safe to return to a non-admin client - excludes
 * GitHub-internal ids/urls, contact info, OAuth tokens, and timestamps that
 * the client has no use for and shouldn't be exposed to.
 */
export interface iPublicUser {
    id: String; // uuid

    github_username: String;
    avatar_url?: String | undefined;

    name?: String | undefined;
    display_name?: String | undefined;
    default_charity?: String | undefined;
    public_opt_in?: Boolean | undefined;

    role?: Role | undefined;
    is_active?: Boolean | undefined;
}

/**
 * Whitelists the fields of a raw user row that are safe to return to a
 * non-admin client, dropping everything else (GitHub-internal ids/urls,
 * email/bio, OAuth tokens, timestamps) regardless of what the row contains.
 * Accepts the profile fields flattened onto the row by the users repo's
 * join against user_profiles, since those aren't part of the bare iUser shape.
 */
export function toPublicUser(
    user: iUser & Partial<Pick<iUserProfile, "display_name" | "default_charity" | "public_opt_in">>,
): iPublicUser {
    return {
        id: user.id,
        github_username: user.github_username,
        avatar_url: user.avatar_url,
        name: user.name,
        display_name: user.display_name,
        default_charity: user.default_charity,
        public_opt_in: user.public_opt_in,
        role: user.role,
        is_active: user.is_active,
    };
}

export interface iGitHubUpsertInput {
    github_id: Number;
    github_username: String;
    github_email: String;
    github_node_id?: String;
    github_profile_url?: String;
    avatar_url?: String;
}

export interface iUserProfile {
    user_id: String; // uuid, FK -> users.id

    display_name?: String;
    default_charity?: String;
    public_opt_in: Boolean;

    created_at?: String;
    updated_at?: String;
}

export interface iProfileUpdateInput {
    display_name?: String;
    default_charity?: String;
    public_opt_in?: Boolean;
}
