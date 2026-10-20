import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"

import SelectedCharitySummary from "../components/ui/SelectedCharitySummary.vue"
import type { iOrg } from "../services/api"

const org: iOrg = { id: 7, ein: "777777777", name: "GiveDirectly", street: "", city: "New York", state: "NY", zip: "10001" }

describe("SelectedCharitySummary.vue", () => {
    it("renders nothing when charity is null", () => {
        const wrapper = mount(SelectedCharitySummary, { props: { charity: null } })

        expect(wrapper.find("button").exists()).toBe(false)
        expect(wrapper.text()).toBe("")
    })

    it("renders the charity's name, letter, and city/state when set", () => {
        const wrapper = mount(SelectedCharitySummary, { props: { charity: org } })

        expect(wrapper.text()).toContain("GiveDirectly")
        expect(wrapper.text()).toContain("New York, NY")
    })

    it("omits the location line when city/state are both blank", () => {
        const bare: iOrg = { ...org, city: "", state: "" }
        const wrapper = mount(SelectedCharitySummary, { props: { charity: bare } })

        expect(wrapper.text()).toContain("GiveDirectly")
        expect(wrapper.text()).not.toContain(",")
    })

    it("marks the row as selected", () => {
        const wrapper = mount(SelectedCharitySummary, { props: { charity: org } })

        expect(wrapper.get("button").attributes("aria-pressed")).toBe("true")
    })

    it("shows a \"selected\" tag so the current pick reads differently from search results", () => {
        const wrapper = mount(SelectedCharitySummary, { props: { charity: org } })

        expect(wrapper.get(".selected-tag").text()).toBe("selected")
    })
})
