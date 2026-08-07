import { iRequestErrors } from "./response";

export const ROLES = ["admin", "user"] as const;
export type Role = typeof ROLES[number];
export const VALID_TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

export interface iUser {
    id: String; // uuid

    github_id: Number;
    github_username: String;
    github_email?: String;
    github_noreply_email?: String;
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
    github_email?: String | undefined;
    github_noreply_email?: String | undefined;
    avatar_url?: String | undefined;

    name?: String | undefined;
    display_name?: String | undefined;
    default_charity?: Number | undefined;
    public_opt_in?: Boolean | undefined;
    timezone?: String | undefined;
    use_real_email?: Boolean | undefined;

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
    user: iUser & Partial<Pick<iUserProfile, "display_name" | "default_charity" | "public_opt_in" | "timezone" | "use_real_email">>,
): iPublicUser {
    return {
        id: user.id,
        github_username: user.github_username,
        github_email: user.github_email,
        github_noreply_email: user.github_noreply_email,
        avatar_url: user.avatar_url,
        name: user.name,
        display_name: user.display_name,
        default_charity: user.default_charity,
        public_opt_in: user.public_opt_in,
        timezone: user.timezone,
        use_real_email: user.use_real_email,
        role: user.role,
        is_active: user.is_active,
    };
}

export interface iGitHubUpsertInput {
    github_id: Number;
    github_username: String;
    github_email: String;
    github_noreply_email: String;
    github_node_id?: String;
    github_profile_url?: String;
    avatar_url?: String;
}

export interface iUserProfile {
    user_id: String; // uuid, FK -> users.id

    display_name?: String;
    default_charity?: Number;
    public_opt_in: Boolean;
    timezone: String; // IANA name, e.g. "America/Chicago"
    use_real_email: Boolean; // commit author email preference: real verified email vs. noreply

    created_at?: String;
    updated_at?: String;
}

export interface iProfileUpdateInput {
    display_name?: String;
    default_charity?: Number;
    public_opt_in?: Boolean;
    timezone?: String;
    use_real_email?: Boolean;
}

/**
 * Picks only the known profile fields out of a PATCH body (silently ignoring
 * anything else, e.g. role/is_active, so they can't be mass-assigned), and
 * validates the type of whichever of those fields are actually present.
 */
export function extractProfileInput(body: Record<string, unknown>): iProfileUpdateInput {
    const input: iProfileUpdateInput = {};

    if ("display_name" in body) input.display_name = body.display_name as string;

    if ("default_charity" in body) input.default_charity = body.default_charity as number;

    if ("public_opt_in" in body) input.public_opt_in = body.public_opt_in as boolean;

    if ("timezone" in body) input.timezone = body.timezone as string;

    if ("use_real_email" in body) input.use_real_email = body.use_real_email as boolean;

    return input;
}

export function validateProfileInput(body: Record<string, unknown>): iRequestErrors[] {
    const errors: iRequestErrors[] = [];

    display_name: {
        if ("display_name" in body) {
            if (typeof body.display_name !== "string") {
                errors.push({property: "display_name", error: "display_name must be a string."});
                break display_name;
            }
    
            if (body.display_name.length < 3) {
                errors.push({property: "display_name", error: "display_name must be at least 3 characters"});
            }
        }
    }

    default_charity: {
        if ("default_charity" in body) {
            if (
                typeof body.default_charity !== "number" ||
                !Number.isInteger(body.default_charity) ||
                body.default_charity <= 0
            ) {
                errors.push({property: "default_charity", error: "default_charity must be a positive integer id."});
                break default_charity;
            }
        }
    }

    public_opt_in: {
        if ("public_opt_in" in body) {
            if (typeof body.public_opt_in !== "boolean") {
                errors.push({property: "public_opt_in", error: "public_opt_in must be a boolean."});
                break public_opt_in;
            }
        }
    }

    timezone: {
        if ("timezone" in body) {
            if (typeof body.timezone !== "string" || !VALID_TIME_ZONES.has(body.timezone)) {
                errors.push({property: "timezone", error: "timezone must be a recognized IANA time zone name."});
                break timezone;
            }
        }
    }

    use_real_email: {
        if ("use_real_email" in body) {
            if (typeof body.use_real_email !== "boolean") {
                errors.push({property: "use_real_email", error: "use_real_email must be a boolean."});
                break use_real_email;
            }
        }
    }

    return errors;
}
