import { parse } from "node-html-parser";
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

export interface iGitHubEmail {
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

export const fetchGitHubEmails = async (accessToken: string): Promise<iGitHubEmail[]> => {
    const res = await fetch("https://api.github.com/user/emails", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch GitHub emails (status ${res.status}).`);
    }

    return (await res.json()) as iGitHubEmail[];
};

export const pickPrimaryVerifiedEmail = (emails: iGitHubEmail[]): string => {
    const primary = emails.find((email) => email.primary && email.verified);

    if (!primary) {
        throw new Error("No verified primary email found on GitHub account.");
    }

    return primary.email;
};

/**
 * GitHub's /user/emails can already include the "keep my email address
 * private" noreply address as one of the listed emails (matched by suffix,
 * not the stricter {id}+{username} shape, so both the newer and older
 * noreply formats GitHub has issued are recognized). Prefer that over
 * computeNoreplyEmail() below when it's present, rather than re-deriving
 * data GitHub already gave us.
 */
export const pickNoreplyEmail = (emails: iGitHubEmail[]): string | undefined =>
    emails.find((email) => email.email.endsWith("@users.noreply.github.com"))?.email;

/**
 * GitHub's own auto-generated "keep my email address private" noreply
 * address format. Deterministic from data already captured at OAuth
 * sign-in (github_id, github_username) - used as the default commit author
 * email for painting commits so a user's real email never needs to appear
 * in a public repo's history, and so no email OAuth scope is required.
 */
export const computeNoreplyEmail = (githubId: number, githubUsername: string): string => {
    return `${githubId}+${githubUsername}@users.noreply.github.com`;
};

export interface iContributionDay {
    date: string;
    count: number;
    level: number;
}

/**
 * Reads GitHub's public, unauthenticated contribution-calendar HTML partial
 * (the same endpoint a profile page's own JS lazy-loads) rather than the
 * authenticated GraphQL API - no PAT/token/scope needed, and `data-level`
 * is GitHub's own literal 0-4 degree label (no color-to-degree inference
 * needed). See .claude/tmp/research.md for how this was chosen/verified.
 */
export const fetchContributionCalendar = async (githubUsername: string, from: string, to: string): Promise<iContributionDay[]> => {
    const res = await fetch(`https://github.com/users/${githubUsername}/contributions?from=${from}&to=${to}`);

    if (!res.ok) {
        throw new Error(`Failed to fetch contribution calendar for ${githubUsername} (status ${res.status}).`);
    }

    const root = parse(await res.text());
    const days: iContributionDay[] = [];

    for (const cell of root.querySelectorAll("td.ContributionCalendar-day")) {
        const date = cell.getAttribute("data-date");
        const levelAttr = cell.getAttribute("data-level");
        const id = cell.getAttribute("id");
        if (!date || levelAttr === undefined || !id) continue;

        const tooltipText = root.querySelector(`tool-tip[for="${id}"]`)?.text.trim() ?? "";
        const match = tooltipText.match(/^(\d+|No)\s+contributions?/i);
        const count = match ? (match[1]!.toLowerCase() === "no" ? 0 : Number(match[1])) : 0;

        days.push({ date, count, level: Number(levelAttr) });
    }

    return days;
};
