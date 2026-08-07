import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"

import GitConfigPreview from "../components/ui/GitConfigPreview.vue"

describe("GitConfigPreview.vue", () => {
    it("renders both lines with correct git config syntax and the given values", () => {
        const wrapper = mount(GitConfigPreview, { props: { username: "lena", email: "lena@example.com" } })

        expect(wrapper.text()).toContain('git config --global user.name "lena"')
        expect(wrapper.text()).toContain('git config --global user.email "lena@example.com"')
    })

    it("has no stray = sign in either line", () => {
        const wrapper = mount(GitConfigPreview, { props: { username: "lena", email: "lena@example.com" } })

        expect(wrapper.text()).not.toContain("=")
    })

    it("reactively updates when props change", async () => {
        const wrapper = mount(GitConfigPreview, { props: { username: "lena", email: "123+lena@users.noreply.github.com" } })
        expect(wrapper.text()).toContain("123+lena@users.noreply.github.com")

        await wrapper.setProps({ email: "lena@real-email.com" })

        expect(wrapper.text()).toContain("lena@real-email.com")
        expect(wrapper.text()).not.toContain("123+lena@users.noreply.github.com")
    })
})
