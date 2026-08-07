import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"

import CharityResultsList from "../components/ui/CharityResultsList.vue"
import type { iOrg } from "../services/api"

const orgs: iOrg[] = [
    { id: 1, ein: "111111111", name: "GiveDirectly", street: "", city: "New York", state: "NY", zip: "10001" },
    { id: 2, ein: "222222222", name: "GiveWell", street: "", city: "Oakland", state: "CA", zip: "94612" },
]

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
    const button = wrapper.findAll("button").find((b) => b.text().includes(text))
    if (!button) throw new Error(`button containing "${text}" not found`)
    return button
}

describe("CharityResultsList.vue", () => {
    it("renders nothing when idle (no query, not loading, no error, no results)", () => {
        const wrapper = mount(CharityResultsList, { props: { results: [] } })

        expect(wrapper.text()).toBe("")
    })

    it("shows a loading state", () => {
        const wrapper = mount(CharityResultsList, { props: { results: [], loading: true } })

        expect(wrapper.text()).toContain("searching")
    })

    it("shows an error state", () => {
        const wrapper = mount(CharityResultsList, { props: { results: [], error: true, query: "give" } })

        expect(wrapper.text()).toContain("couldn't load results")
    })

    it("shows an empty state once a query has results but finds none", () => {
        const wrapper = mount(CharityResultsList, { props: { results: [], query: "xyz" } })

        expect(wrapper.text()).toContain('no charities found for "xyz"')
    })

    it("renders each result as a CharityListItem row", () => {
        const wrapper = mount(CharityResultsList, { props: { results: orgs, query: "give" } })

        expect(findButton(wrapper, "GiveDirectly")).toBeTruthy()
        expect(findButton(wrapper, "GiveWell")).toBeTruthy()
    })

    it("marks the row matching selectedId as selected", () => {
        const wrapper = mount(CharityResultsList, { props: { results: orgs, query: "give", selectedId: 2 } })

        expect(findButton(wrapper, "GiveDirectly").attributes("aria-pressed")).toBe("false")
        expect(findButton(wrapper, "GiveWell").attributes("aria-pressed")).toBe("true")
    })

    it("emits select with the chosen org on click", async () => {
        const wrapper = mount(CharityResultsList, { props: { results: orgs, query: "give" } })

        await findButton(wrapper, "GiveWell").trigger("click")

        expect(wrapper.emitted("select")?.[0]).toEqual([orgs[1]])
    })
})
