import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"

import BaseTextInput from "../components/ui/BaseTextInput.vue"

describe("BaseTextInput.vue", () => {
    it("hides the clear button when the value is empty", () => {
        const wrapper = mount(BaseTextInput, { props: { modelValue: "" } })

        expect(wrapper.find(".clear-button").exists()).toBe(false)
    })

    it("shows the clear button once the value is populated", () => {
        const wrapper = mount(BaseTextInput, { props: { modelValue: "charity" } })

        expect(wrapper.find(".clear-button").exists()).toBe(true)
    })

    it("clicking the clear button empties the model value, emits clear, and refocuses the input", async () => {
        const wrapper = mount(BaseTextInput, {
            props: { modelValue: "charity" },
            attachTo: document.body,
        })

        await wrapper.get(".clear-button").trigger("click")

        expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([""])
        expect(wrapper.emitted("clear")).toHaveLength(1)
        expect(document.activeElement).toBe(wrapper.get("input").element)

        wrapper.unmount()
    })

    it("does not render a leading-icon wrapper when no leading-icon slot is provided", () => {
        const wrapper = mount(BaseTextInput, { props: { modelValue: "" } })

        expect(wrapper.find(".leading-icon").exists()).toBe(false)
    })

    it("renders the leading-icon slot content when provided", () => {
        const wrapper = mount(BaseTextInput, {
            props: { modelValue: "" },
            slots: { "leading-icon": "<svg data-testid=\"icon\"></svg>" },
        })

        expect(wrapper.find(".leading-icon [data-testid=icon]").exists()).toBe(true)
    })

    it("exposes an accessible name on the clear button, overridable via clearLabel", () => {
        const wrapper = mount(BaseTextInput, { props: { modelValue: "charity", clearLabel: "Clear search" } })

        expect(wrapper.get(".clear-button").attributes("aria-label")).toBe("Clear search")
    })

    it("defaults the clear button's accessible name when clearLabel is omitted", () => {
        const wrapper = mount(BaseTextInput, { props: { modelValue: "charity" } })

        expect(wrapper.get(".clear-button").attributes("aria-label")).toBe("Clear")
    })

    it("typing emits update:modelValue with the new value", async () => {
        const wrapper = mount(BaseTextInput, { props: { modelValue: "" } })

        await wrapper.get("input").setValue("gi")

        expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["gi"])
    })
})
