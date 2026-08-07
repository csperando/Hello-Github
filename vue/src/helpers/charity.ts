import type { iOrg } from "@/services/api"

/** "city, state" for a charity row's subtitle line, omitting gracefully if either is blank. */
export function charityLocation(org: Pick<iOrg, "city" | "state">): string | undefined {
    const parts = [org.city, org.state].filter((p) => !!p && p.trim().length > 0)
    return parts.length ? parts.join(", ") : undefined
}
