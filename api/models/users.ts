
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

    role?: String;
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
