const API_URL = import.meta.env.VITE_API_URL

export function githubLoginUrl(): string {
    return `${API_URL}/auth/github/login`
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

export interface iProfileUpdatePayload {
    display_name?: string
    default_charity?: string
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
