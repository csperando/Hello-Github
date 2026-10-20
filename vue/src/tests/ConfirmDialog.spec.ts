import { describe, it, expect, afterEach } from "vitest"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"

import ConfirmDialog from "../components/ui/ConfirmDialog.vue"

describe("ConfirmDialog.vue", () => {
    let wrapper: VueWrapper | undefined

    function mountDialog(open = true) {
        wrapper = mount(ConfirmDialog, {
            props: { open, title: "switch to 2024?", confirmLabel: "switch", cancelLabel: "keep editing" },
            slots: { default: "some squares may be removed" },
            attachTo: document.body,
        })
        return wrapper
    }

    afterEach(() => {
        wrapper?.unmount()
        wrapper = undefined
    })

    it("renders nothing while closed", () => {
        expect(mountDialog(false).find('[role="alertdialog"]').exists()).toBe(false)
    })

    it("is a modal alertdialog named by its title and described by its body", () => {
        const dialog = mountDialog().get('[role="alertdialog"]')

        expect(dialog.attributes("aria-modal")).toBe("true")
        expect(document.getElementById(dialog.attributes("aria-labelledby")!)?.textContent).toBe("switch to 2024?")
        expect(document.getElementById(dialog.attributes("aria-describedby")!)?.textContent).toContain("some squares may be removed")
    })

    it("focuses the cancel button when it opens, and returns focus when it closes", async () => {
        const opener = document.createElement("button")
        document.body.appendChild(opener)
        opener.focus()

        const w = mountDialog(false)
        await w.setProps({ open: true })
        await flushPromises()
        expect(document.activeElement?.textContent?.trim()).toBe("keep editing")

        await w.setProps({ open: false })
        expect(document.activeElement).toBe(opener)
        opener.remove()
    })

    it("emits confirm and cancel from its buttons", async () => {
        const w = mountDialog()
        const [cancel, confirm] = w.findAll("button")

        await confirm!.trigger("click")
        await cancel!.trigger("click")

        expect(w.emitted("confirm")).toHaveLength(1)
        expect(w.emitted("cancel")).toHaveLength(1)
    })

    it("cancels on Escape and on a click on the backdrop, but not on a click inside the panel", async () => {
        const w = mountDialog()

        await w.get('[role="alertdialog"]').trigger("keydown", { key: "Escape" })
        await w.get(".confirm-backdrop").trigger("click")
        await w.get('[role="alertdialog"]').trigger("click")

        expect(w.emitted("cancel")).toHaveLength(2)
    })

    it("keeps Tab focus inside the dialog", async () => {
        const w = mountDialog()
        const [cancel, confirm] = w.findAll("button").map((b) => b.element as HTMLElement)

        confirm!.focus()
        await w.get('[role="alertdialog"]').trigger("keydown", { key: "Tab" })
        expect(document.activeElement).toBe(cancel)

        await w.get('[role="alertdialog"]').trigger("keydown", { key: "Tab", shiftKey: true })
        expect(document.activeElement).toBe(confirm)
    })
})
