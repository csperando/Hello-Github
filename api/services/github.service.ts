import { config } from "../config/config";

export interface iGitHubUser {
    id: number;
    login: string;
    node_id: string;
    avatar_url: string;
    html_url: string;
    name: string | null;
    bio: string | null;
    email: string | null;
}

interface iGitHubEmail {
    email: string;
    primary: boolean;
    verified: boolean;
    visibility: string | null;
}

export const exchangeCodeForToken = async (code: string): Promise<string> => {
    const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({
            client_id: config.GITHUB_CLIENT_ID,
            client_secret: config.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: config.GITHUB_CALLBACK_URL,
        }),
    });

    const body: any = await res.json();

    // GitHub returns 200 with an { error } payload for bad/reused codes, not a 4xx
    if (!res.ok || body.error) {
        throw new Error(body.error_description || body.error || `Failed to exchange GitHub code for token (status ${res.status}).`);
    }

    return body.access_token;
};

export const fetchGitHubUser = async (accessToken: string): Promise<iGitHubUser> => {
    const res = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch GitHub user (status ${res.status}).`);
    }

    return (await res.json()) as iGitHubUser;
};

export const fetchPrimaryVerifiedEmail = async (accessToken: string): Promise<string> => {
    const res = await fetch("https://api.github.com/user/emails", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch GitHub emails (status ${res.status}).`);
    }

    const emails = (await res.json()) as iGitHubEmail[];
    const primary = emails.find((email) => email.primary && email.verified);

    if (!primary) {
        throw new Error("No verified primary email found on GitHub account.");
    }

    return primary.email;
};
