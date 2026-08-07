export interface iDebounced<Args extends unknown[]> {
    (...args: Args): void
    cancel: () => void
}

/**
 * Wraps fn so it only runs after delayMs of inactivity - each call resets the
 * pending timer rather than queuing another invocation.
 */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delayMs: number): iDebounced<Args> {
    let timer: ReturnType<typeof setTimeout> | undefined

    const debounced = (...args: Args) => {
        if (timer !== undefined) clearTimeout(timer)
        timer = setTimeout(() => {
            timer = undefined
            fn(...args)
        }, delayMs)
    }

    debounced.cancel = () => {
        if (timer !== undefined) clearTimeout(timer)
        timer = undefined
    }

    return debounced
}
