import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { debounce } from "../helpers/debounce"

describe("debounce", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("delays invocation until delayMs of inactivity has passed", () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 300)

        debounced("a")
        expect(fn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(299)
        expect(fn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(fn).toHaveBeenCalledExactlyOnceWith("a")
    })

    it("coalesces rapid repeat calls into a single trailing invocation", () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 300)

        debounced("a")
        vi.advanceTimersByTime(100)
        debounced("b")
        vi.advanceTimersByTime(100)
        debounced("c")
        vi.advanceTimersByTime(300)

        expect(fn).toHaveBeenCalledExactlyOnceWith("c")
    })

    it("cancel() prevents a pending call from firing", () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 300)

        debounced("a")
        debounced.cancel()
        vi.advanceTimersByTime(1000)

        expect(fn).not.toHaveBeenCalled()
    })

    it("cancel() on an already-idle debouncer is a no-op", () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 300)

        expect(() => debounced.cancel()).not.toThrow()
    })
})
