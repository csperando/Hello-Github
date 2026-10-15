const API_URL = import.meta.env.VITE_API_URL

export function githubLoginUrl(): string {
    return `${API_URL}/auth/github/login`
}

/** One-off step-up consent after buying a design: GitHub asks to let us open the canvas-repo issue as the user. */
export function githubPaintUrl(designId: string): string {
    return `${API_URL}/auth/github/paint?designId=${encodeURIComponent(designId)}`
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${API_URL}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...init.headers,
        },
    })
}

export interface iOrg {
    id: number
    ein: string
    name: string
    street: string
    city: string
    state: string
    zip: string
}

export async function searchOrgs(query: string): Promise<Response> {
    return apiFetch(`/org?name=${encodeURIComponent(query)}`)
}

export async function getOrgById(orgId: number): Promise<Response> {
    return apiFetch(`/org/${orgId}`)
}

export interface iProfileUpdatePayload {
    display_name?: string
    default_charity?: number
    public_opt_in?: boolean
    timezone?: string
    use_real_email?: boolean
}

export async function updateProfile(userId: string, payload: iProfileUpdatePayload): Promise<Response> {
    return apiFetch(`/user/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    })
}
