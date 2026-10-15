/** The API's error message from a failed response body, or `fallback` when it isn't a plain non-empty string - never render whatever object a server happens to send back. */
export function errorMessage(body: unknown, fallback: string): string {
    const error = (body as { error?: unknown } | null)?.error
    return typeof error === 'string' && error.trim() ? error : fallback
}
