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
