import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"

import CharityPicker from "../components/ui/CharityPicker.vue"
import type { iOrg } from "../services/api"

const searchOrgsMock = vi.fn()

vi.mock("@/services/api", () => ({
    searchOrgs: (...args: unknown[]) => searchOrgsMock(...args),
}))

function jsonResponse(body: unknown, ok = true) {
    return { ok, json: async () => body } as Response
}

const orgs: iOrg[] = [
    { id: 1, ein: "111111111", name: "GiveDirectly", street: "", city: "New York", state: "NY", zip: "10001" },
    { id: 2, ein: "222222222", name: "GiveWell", street: "", city: "Oakland", state: "CA", zip: "94612" },
]

type Wrapper = ReturnType<typeof mount<typeof CharityPicker>>

function mountPicker(selected: iOrg | null = null) {
    return mount(CharityPicker, { props: { selected }, attachTo: document.body })
}

async function search(wrapper: Wrapper, value = "give") {
    await wrapper.get("input").setValue(value)
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
}

function dropdown(wrapper: Wrapper) {
    return wrapper.find(".charity-picker__dropdown")
}

describe("CharityPicker.vue", () => {
    let wrapper: Wrapper | undefined

    beforeEach(() => {
        searchOrgsMock.mockReset()
        searchOrgsMock.mockResolvedValue(jsonResponse({ data: orgs }))
        vi.useFakeTimers()
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = undefined
        vi.useRealTimers()
    })

    it("renders no dropdown before anything is searched", () => {
        wrapper = mountPicker()

        expect(dropdown(wrapper).exists()).toBe(false)
    })

    it("shows the results in a dropdown once a search returns", async () => {
        wrapper = mountPicker()
        await search(wrapper)

        expect(dropdown(wrapper).text()).toContain("GiveDirectly")
        expect(dropdown(wrapper).text()).toContain("GiveWell")
    })

    it("shows the current selection with a \"selected\" tag above the input", () => {
        wrapper = mountPicker(orgs[0]!)

        expect(wrapper.get(".charity-picker__summary").text()).toContain("GiveDirectly")
        expect(wrapper.get(".selected-tag").text()).toBe("selected")
    })

    it("selecting a result emits select, clears the field, and closes the dropdown", async () => {
        wrapper = mountPicker()
        await search(wrapper)

        const giveWell = dropdown(wrapper).findAll("button").find((b) => b.text().includes("GiveWell"))!
        await giveWell.trigger("click")

        expect(wrapper.emitted("select")).toEqual([[orgs[1]]])
        expect((wrapper.get("input").element as HTMLInputElement).value).toBe("")
        expect(dropdown(wrapper).exists()).toBe(false)
    })

    it("Escape closes the dropdown but keeps the typed text", async () => {
        wrapper = mountPicker()
        await search(wrapper)

        await wrapper.get("input").trigger("keydown", { key: "Escape" })

        expect(dropdown(wrapper).exists()).toBe(false)
        expect((wrapper.get("input").element as HTMLInputElement).value).toBe("give")
    })

    it("refocusing the input reopens a dropdown that was closed", async () => {
        wrapper = mountPicker()
        await search(wrapper)
        await wrapper.get("input").trigger("keydown", { key: "Escape" })

        await wrapper.get("input").trigger("focusin")

        expect(dropdown(wrapper).text()).toContain("GiveDirectly")
    })

    it("a pointerdown outside the picker closes the dropdown", async () => {
        wrapper = mountPicker()
        await search(wrapper)

        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
        await wrapper.vm.$nextTick()

        expect(dropdown(wrapper).exists()).toBe(false)
    })

    it("a pointerdown inside the dropdown keeps it open so the click can land", async () => {
        wrapper = mountPicker()
        await search(wrapper)

        dropdown(wrapper).element.dispatchEvent(new Event("pointerdown", { bubbles: true }))
        await wrapper.vm.$nextTick()

        expect(dropdown(wrapper).exists()).toBe(true)
    })

    it("tabbing focus to an element outside the picker closes the dropdown", async () => {
        const outside = document.createElement("input")
        document.body.appendChild(outside)
        wrapper = mountPicker()
        await search(wrapper)

        await wrapper.get("input").trigger("focusout", { relatedTarget: outside })

        expect(dropdown(wrapper).exists()).toBe(false)
        outside.remove()
    })

    it("moving focus from the input into the results keeps the dropdown open", async () => {
        wrapper = mountPicker()
        await search(wrapper)
        const firstResult = dropdown(wrapper).get("button").element

        await wrapper.get("input").trigger("focusout", { relatedTarget: firstResult })

        expect(dropdown(wrapper).exists()).toBe(true)
    })

    it("renders default slot content between the summary and the search input", () => {
        wrapper = mount(CharityPicker, {
            props: { selected: orgs[0]! },
            slots: { default: '<p class="slot-content">remove charity</p>' },
        })

        const html = wrapper.html()
        expect(html.indexOf("GiveDirectly")).toBeLessThan(html.indexOf("slot-content"))
        expect(html.indexOf("slot-content")).toBeLessThan(html.indexOf("<input"))
    })
})
