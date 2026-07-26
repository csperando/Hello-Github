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
