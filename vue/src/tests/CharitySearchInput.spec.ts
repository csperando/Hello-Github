import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mount } from "@vue/test-utils"

import CharitySearchInput from "../components/ui/CharitySearchInput.vue"

describe("CharitySearchInput.vue", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("renders the search icon", () => {
        const wrapper = mount(CharitySearchInput)

        expect(wrapper.find(".leading-icon svg").exists()).toBe(true)
    })

    it("does not emit search for fewer than 3 characters", async () => {
        const wrapper = mount(CharitySearchInput)

        await wrapper.get("input").setValue("gi")
        await vi.advanceTimersByTimeAsync(1000)

        expect(wrapper.emitted("search")).toBeUndefined()
    })

    it("emits search with the trimmed query after 300ms once 3+ characters are typed", async () => {
        const wrapper = mount(CharitySearchInput)

        await wrapper.get("input").setValue("  give  ")
        await vi.advanceTimersByTimeAsync(299)
        expect(wrapper.emitted("search")).toBeUndefined()

        await vi.advanceTimersByTimeAsync(1)
        expect(wrapper.emitted("search")).toEqual([["give"]])
    })

    it("coalesces rapid keystrokes inside the debounce window into a single search", async () => {
        const wrapper = mount(CharitySearchInput)

        await wrapper.get("input").setValue("giv")
        await vi.advanceTimersByTimeAsync(100)
        await wrapper.get("input").setValue("give")
        await vi.advanceTimersByTimeAsync(100)
        await wrapper.get("input").setValue("gived")
        await vi.advanceTimersByTimeAsync(300)

        expect(wrapper.emitted("search")).toEqual([["gived"]])
    })

    it("clicking the clear button emits cleared immediately, without waiting for the debounce", async () => {
        const wrapper = mount(CharitySearchInput, { attachTo: document.body })

        await wrapper.get("input").setValue("give")
        await wrapper.get(".clear-button").trigger("click")

        expect(wrapper.emitted("cleared")).toHaveLength(1)
        expect(wrapper.emitted("search")).toBeUndefined()

        await vi.advanceTimersByTimeAsync(300)
        expect(wrapper.emitted("search")).toBeUndefined()

        wrapper.unmount()
    })

    it("emits cleared when the query drops back below the 3-character minimum", async () => {
        const wrapper = mount(CharitySearchInput)

        await wrapper.get("input").setValue("give")
        await vi.advanceTimersByTimeAsync(300)
        expect(wrapper.emitted("search")).toEqual([["give"]])

        await wrapper.get("input").setValue("gi")
        expect(wrapper.emitted("cleared")).toHaveLength(1)
    })

    it("cancels a pending debounce on unmount so a stale search never fires", async () => {
        const wrapper = mount(CharitySearchInput)

        await wrapper.get("input").setValue("give")
        wrapper.unmount()
        await vi.advanceTimersByTimeAsync(300)

        expect(wrapper.emitted("search")).toBeUndefined()
    })
})
