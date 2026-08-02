<script setup lang="ts">
    import { computed, onMounted, ref } from "vue"
    import { useRoute, useRouter } from "vue-router"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import CustomRangeSlider from "@/components/ui/CustomRangeSlider.vue"
    import GridLegend from "@/components/ui/GridLegend.vue"
    import { LEVEL_COLORS, todayAnchor, currentYearAnchor, toDateString } from "@/helpers/grid"
    import { getDesign, getSelectionCount, type iDesign, type iDesignCreatePayload } from "@/services/designs"
    import { useDesignsStore } from "@/stores/designs"
    import { useAuthStore } from "@/stores/auth"

    const WEEKS = 53
    const DAYS = 7 // row 0 = Sunday, matching stampPattern's idx = week * DAYS + row and GitHub's own week layout
    const MONTH_LABELS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

    type Pattern = number[][]

    function emptyGrid(): number[] {
        return new Array(WEEKS * DAYS).fill(0)
    }

    function stampPattern(pattern: Pattern, startWeek: number, level: number): number[] {
        const grid = emptyGrid()
        pattern.forEach((row, r) => {
            row.forEach((filled, c) => {
                if (filled) {
                    const week = startWeek + c
                    const idx = week * DAYS + r
                    if (idx >= 0 && idx < grid.length) grid[idx] = level
                }
            })
        })
        return grid
    }

    const HEART: Pattern = [
        [0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
        [1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0],
        [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    ]
    const SMILEY: Pattern = [
        [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
        [1, 0, 1, 0, 0, 0, 1, 0, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
        [0, 1, 0, 1, 1, 1, 1, 0, 1, 0],
        [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    ]
    const DIAMOND: Pattern = [
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
        [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
    ]

    const TEMPLATES = [
        { key: "blank", name: "Blank canvas", icon: "▢", build: () => emptyGrid() },
        { key: "heart", name: "Heart", icon: "♥", build: () => stampPattern(HEART, 19, 4) },
        { key: "smiley", name: "Smiley", icon: "☺", build: () => stampPattern(SMILEY, 21, 3) },
        { key: "diamond", name: "Diamond", icon: "◆", build: () => stampPattern(DIAMOND, 20, 4) },
    ]

    type TabKey = "year" | "today"
    const currentYear = new Date().getFullYear()

    const grid = ref<number[]>(stampPattern(HEART, 19, 4))
    const selectedTemplate = ref("heart")
    const brush = ref(4)
    const painting = ref(false)
    const activeTab = ref<TabKey>("today")
    const publicOptIn = ref(true)
    const designName = ref("my first design")

    // Confirmation before making a design private that other users currently
    // have selected - making it private doesn't touch their selections or
    // scheduling, it only means they'll no longer be able to see its content
    // (Dashboard shows "no longer available" for them) - so this is a warning,
    // not a hard block.
    const otherUsersCount = ref(0)
    const showPrivacyWarning = ref(false)

    async function onTogglePublic() {
        const goingPrivate = publicOptIn.value
        if (goingPrivate && loadedDesign.value) {
            const res = await getSelectionCount(loadedDesign.value.id)
            if (res.ok) {
                const body = await res.json()
                const count = body.data?.[0]?.count ?? 0
                if (count > 0) {
                    otherUsersCount.value = count
                    showPrivacyWarning.value = true
                    return
                }
            }
        }
        publicOptIn.value = !publicOptIn.value
    }

    function confirmMakePrivate() {
        publicOptIn.value = false
        showPrivacyWarning.value = false
    }

    function cancelMakePrivate() {
        showPrivacyWarning.value = false
    }

    // Recurrence: "repeat every year" (annual carry-forward of the whole design)
    // and "custom range" (tile a narrower slice across the rest of the grid) are
    // mutually exclusive - enabling one turns the other off.
    const repeatEveryYear = ref(false)
    const customRangeEnabled = ref(false)
    const rangeStart = ref(0)
    const rangeEnd = ref(6)

    function toggleRepeatEveryYear() {
        repeatEveryYear.value = !repeatEveryYear.value
        if (repeatEveryYear.value) customRangeEnabled.value = false
    }

    function toggleCustomRange() {
        customRangeEnabled.value = !customRangeEnabled.value
        if (customRangeEnabled.value) repeatEveryYear.value = false
    }

    // Shared recurrence-duration control - applies to whichever of the two
    // toggles above is active. Mirrors the schema's repeat_indefinitely /
    // recurrence_end_date pairing directly.
    const repeatIndefinitely = ref(true)
    const recurrenceEndDate = ref("")

    function setRecurrenceIndefinite() {
        repeatIndefinitely.value = true
    }

    function setRecurrenceUntil() {
        repeatIndefinitely.value = false
    }

    function modeButtonStyle(active: boolean) {
        return {
            flex: "1",
            fontFamily: "var(--font-mono)",
            fontSize: "11.5px",
            fontWeight: 600,
            background: active ? "var(--color-accent)" : "var(--color-bg-inset)",
            color: active ? "var(--color-accent-on)" : "var(--color-text-muted-1)",
            border: active ? "none" : "1px solid var(--color-border-mid)",
            borderRadius: "7px",
            padding: "9px 6px",
            cursor: "pointer",
        }
    }

    const indefiniteButtonStyle = computed(() => modeButtonStyle(repeatIndefinitely.value))
    const untilButtonStyle = computed(() => modeButtonStyle(!repeatIndefinitely.value))

    function cycleCell(idx: number) {
        const current = grid.value[idx] ?? 0
        grid.value[idx] = (current + 1) % 5
    }

    function paintCell(idx: number, level: number) {
        grid.value[idx] = level
    }

    function onCellDown(idx: number) {
        painting.value = true
        cycleCell(idx)
    }

    function onCellEnter(idx: number) {
        if (painting.value) paintCell(idx, brush.value)
    }

    function onClear() {
        grid.value = emptyGrid()
        selectedTemplate.value = "blank"
    }

    function onRandomize() {
        grid.value = emptyGrid().map(() => (Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 4) : 0))
        selectedTemplate.value = "blank"
    }

    function applyTemplate(key: string) {
        const tpl = TEMPLATES.find((t) => t.key === key)
        if (!tpl) return
        grid.value = tpl.build()
        selectedTemplate.value = key
    }

    // The design currently being edited, if the route carries a :designId - see
    // onMounted below. While set, it overrides the tab-based anchor with the
    // selection's own saved start_date, so the grid re-anchors to exactly where
    // it was when saved rather than to "today"/"this year" as of right now.
    // Content (name/is_public/pattern) and scheduling (start_date/repeat_
    // indefinitely/recurrence_end_date) come from two different resources now -
    // loadedDesign is content-only, loadedSelection carries the schedule.
    const loadedDesign = ref<iDesign | null>(null)
    const loadedSelection = ref<{
        start_date: string
        repeat_indefinitely: boolean
        recurrence_end_date?: string | null
    } | null>(null)

    // The grid's first column is always the most recent Sunday on/before this
    // anchor date - "today" gives a rolling window starting now, "year" starts
    // from Jan 1 of the current year for year-to-date designs. Both tabs use the
    // same fixed 53-week grid width, extending forward from the anchor (this app
    // designs future contributions, unlike GitHub's own profile graph which runs
    // backward from today).
    const anchorDate = computed(() => {
        if (loadedSelection.value) return new Date(`${loadedSelection.value.start_date}T00:00:00Z`)
        return activeTab.value === "today" ? todayAnchor() : currentYearAnchor()
    })
    const anchorDateLabel = computed(() =>
        anchorDate.value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
    )

    function selectTab(key: TabKey) {
        if (key === activeTab.value) return
        activeTab.value = key
        // Switching tabs re-bases the grid onto a different real-world date range,
        // so painted cells can't be meaningfully remapped onto new columns - reset
        // the canvas rather than leaving stale art anchored to the wrong dates.
        // This also detaches from any loaded design: further edits become a new
        // design rather than continuing to edit the one that was loaded.
        loadedDesign.value = null
        loadedSelection.value = null
        grid.value = emptyGrid()
        selectedTemplate.value = "blank"
    }

    /**
     * Reconstructs editor state from a saved design + the caller's own
     * selection of it. The schema doesn't record which UI mode ("repeat every
     * year" vs "custom range") produced a given repeat_indefinitely/
     * recurrence_end_date pairing, so this is a best-effort reconstruction: a
     * pattern narrower than the full grid is treated as a custom range; a
     * full-width pattern's repeat_indefinitely maps back to "repeat every year".
     */
    function applyLoadedDesign(
        design: iDesign,
        selection: { start_date: string; repeat_indefinitely: boolean; recurrence_end_date?: string | null },
    ) {
        loadedDesign.value = design
        loadedSelection.value = selection

        designName.value = design.name
        publicOptIn.value = design.is_public
        repeatIndefinitely.value = selection.repeat_indefinitely
        recurrenceEndDate.value = selection.recurrence_end_date ?? ""

        const patternWeeks = design.pattern.length / DAYS
        const isFullWidth = patternWeeks >= WEEKS

        customRangeEnabled.value = !isFullWidth
        repeatEveryYear.value = isFullWidth && selection.repeat_indefinitely
        if (!isFullWidth) {
            rangeStart.value = 0
            rangeEnd.value = patternWeeks - 1
        }

        const newGrid = emptyGrid()
        design.pattern.forEach((level, i) => {
            if (i < newGrid.length) newGrid[i] = level
        })
        grid.value = newGrid
        selectedTemplate.value = "blank"
    }

    const route = useRoute()

    onMounted(async () => {
        const designId = route.params.designId
        if (typeof designId !== "string") return

        const res = await getDesign(designId)
        if (!res.ok) return

        const body = await res.json()
        const design: iDesign | undefined = body.data?.[0]
        if (!design) return

        // GET /design/:id returns content only - the caller's own scheduling of it
        // (start_date/repeat_indefinitely/recurrence_end_date) comes from their
        // selections list.
        await designsStore.fetchSelections()
        const selection = designsStore.selections.find((s) => s.design_id === designId)
        if (selection) applyLoadedDesign(design, selection)
    })

    function cellDateLabel(week: number, day: number): string {
        const date = new Date(anchorDate.value)
        date.setUTCDate(date.getUTCDate() + week * 7 + day)
        return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    }

    const cells = computed(() => {
        const rangeWidth = rangeEnd.value - rangeStart.value + 1
        return grid.value.map((level, idx) => {
            const week = Math.floor(idx / DAYS)
            const day = idx % DAYS
            let paintIdx = idx
            let ghost = false

            if (customRangeEnabled.value && (week < rangeStart.value || week > rangeEnd.value)) {
                ghost = true
                const relWeek = ((week - rangeStart.value) % rangeWidth + rangeWidth) % rangeWidth
                paintIdx = (rangeStart.value + relWeek) * DAYS + day
            }

            const displayLevel = customRangeEnabled.value ? (grid.value[paintIdx] ?? 0) : level
            return {
                idx,
                paintIdx,
                bg: LEVEL_COLORS[displayLevel] ?? LEVEL_COLORS[0]!,
                opacity: ghost ? 0.38 : 1,
                title: cellDateLabel(week, day),
            }
        })
    })

    // One label per real month transition, positioned at the column where that
    // month actually starts relative to the anchor - not evenly spaced Jan-Dec,
    // since the grid always starts at anchorDate (which is rarely Jan 1).
    const months = computed(() => {
        const labels: { label: string; col: number }[] = []
        let lastMonth = -1
        for (let week = 0; week < WEEKS; week++) {
            const date = new Date(anchorDate.value)
            date.setUTCDate(date.getUTCDate() + week * 7)
            const month = date.getUTCMonth()
            if (month !== lastMonth) {
                labels.push({ label: MONTH_LABELS[month]!, col: week + 1 })
                lastMonth = month
            }
        }
        return labels
    })

    const templates = computed(() =>
        TEMPLATES.map((t) => ({
            key: t.key,
            name: t.name,
            icon: t.icon,
            selected: t.key === selectedTemplate.value,
            bg: t.key === selectedTemplate.value ? "var(--color-accent-soft)" : "transparent",
            border: t.key === selectedTemplate.value ? "var(--color-accent-border)" : "var(--color-border)",
        })),
    )

    const brushLevels = computed(() =>
        LEVEL_COLORS.map((color, lvl) => ({
            lvl,
            bg: color,
            selected: lvl === brush.value,
            border: lvl === brush.value ? "var(--color-text)" : "transparent",
        })),
    )

    const TABS: { key: TabKey; label: string }[] = [
        { key: "year", label: String(currentYear) },
        { key: "today", label: "Today" },
    ]

    const tabs = computed(() =>
        TABS.map((t) => ({
            ...t,
            bg: t.key === activeTab.value ? "var(--color-accent)" : "transparent",
            color: t.key === activeTab.value ? "var(--color-accent-on)" : "var(--color-text-muted-2)",
        })),
    )

    const activeTabLabel = computed(() => TABS.find((t) => t.key === activeTab.value)?.label ?? "Today")

    const painted = computed(() => grid.value.filter((l) => l > 0).length)
    const commitCount = computed(() => painted.value * brush.value * 2)

    const router = useRouter()
    const designsStore = useDesignsStore()
    // authStore.user is already populated here: the router's requiresAuth guard
    // (vue/src/router/index.ts) awaits fetchMe() before this route resolves.
    const authStore = useAuthStore()
    const isSaving = ref(false)
    const saveError = ref("")

    const defaultCharityLabel = computed(() => authStore.user?.default_charity || "no charity selected")
    const defaultCharityLetter = computed(() => (authStore.user?.default_charity?.charAt(0) || "–").toUpperCase())

    /**
     * Extracts the pattern actually being saved, plus the resulting start_date:
     * with custom range on, the explicit [rangeStart, rangeEnd] slice (including
     * any intentional empty spacer columns); otherwise the tight bounding box of
     * painted columns (first through last non-empty). Returns null if there's
     * nothing to save (grid is fully empty and custom range is off).
     */
    function extractSavePayload(): { start_date: string; pattern: number[] } | null {
        let firstCol: number
        let lastCol: number

        if (customRangeEnabled.value) {
            firstCol = rangeStart.value
            lastCol = rangeEnd.value
        } else {
            firstCol = -1
            lastCol = -1
            for (let week = 0; week < WEEKS; week++) {
                let hasPaint = false
                for (let day = 0; day < DAYS; day++) {
                    if ((grid.value[week * DAYS + day] ?? 0) > 0) {
                        hasPaint = true
                        break
                    }
                }
                if (hasPaint) {
                    if (firstCol === -1) firstCol = week
                    lastCol = week
                }
            }
            if (firstCol === -1) return null
        }

        const pattern: number[] = []
        for (let week = firstCol; week <= lastCol; week++) {
            for (let day = 0; day < DAYS; day++) {
                pattern.push(grid.value[week * DAYS + day] ?? 0)
            }
        }

        const start = new Date(anchorDate.value)
        start.setUTCDate(start.getUTCDate() + firstCol * 7)

        return { start_date: toDateString(start), pattern }
    }

    async function saveDesign(): Promise<boolean> {
        saveError.value = ""
        const extracted = extractSavePayload()
        if (!extracted) {
            saveError.value = "Paint at least one square before saving."
            return false
        }

        // Neither recurrence mechanism active means the design is a one-off that
        // doesn't repeat at all - regardless of what the shared duration control
        // happens to be set to.
        const recurrenceActive = repeatEveryYear.value || customRangeEnabled.value
        const finalRepeatIndefinitely = recurrenceActive && repeatIndefinitely.value
        const finalRecurrenceEndDate =
            recurrenceActive && !repeatIndefinitely.value && recurrenceEndDate.value ? recurrenceEndDate.value : null

        isSaving.value = true
        try {
            if (loadedDesign.value) {
                const updatedDesign = await designsStore.updateDesignContent(loadedDesign.value.id, {
                    name: designName.value,
                    is_public: publicOptIn.value,
                    pattern: extracted.pattern,
                })
                if (!updatedDesign) {
                    saveError.value = "Could not save changes."
                    return false
                }

                const updatedSelection = await designsStore.updateSelectionSchedule(loadedDesign.value.id, {
                    start_date: extracted.start_date,
                    repeat_indefinitely: finalRepeatIndefinitely,
                    recurrence_end_date: finalRecurrenceEndDate,
                })
                if (!updatedSelection) {
                    saveError.value = "Could not save changes."
                    return false
                }

                loadedDesign.value = updatedDesign
                loadedSelection.value = updatedSelection
                return true
            }

            const payload: iDesignCreatePayload = {
                name: designName.value,
                is_public: publicOptIn.value,
                start_date: extracted.start_date,
                pattern: extracted.pattern,
                repeat_indefinitely: finalRepeatIndefinitely,
                recurrence_end_date: finalRecurrenceEndDate,
            }

            const created = await designsStore.createDesign(payload)
            if (!created) {
                saveError.value = "Could not save this design."
                return false
            }
            loadedDesign.value = created.design
            loadedSelection.value = created.selection
            router.replace(`/editor/${created.design.id}`)
            return true
        } finally {
            isSaving.value = false
        }
    }

    async function onContinueToCheckout() {
        const saved = await saveDesign()
        if (saved) router.push("/checkout")
    }
</script>

<template>
    <div class="page">

        <AppNavbar sticky />

        <!-- EDITOR SUB-BAR -->
        <div class="sub-bar">
            <div class="sub-bar-left">
                <span>editor</span>
                <span class="divider"></span>
                <span class="draft-label">saved as draft</span>
            </div>

            <div class="tabs-wrap">
                <button
                    v-for="t in tabs"
                    :key="t.key"
                    class="tab-btn"
                    @click="selectTab(t.key)"
                    :style="{ background: t.bg, color: t.color }"
                >{{ t.label }}</button>
            </div>

            <div class="sub-bar-right">
                <span v-if="saveError" class="save-error">{{ saveError }}</span>
                <BaseButton
                    variant="secondary"
                    @click="saveDesign"
                    :loading="isSaving"
                    :disabled="isSaving"
                    class="save-btn"
                >{{ loadedDesign ? "save changes" : "save as draft" }}</BaseButton>
                <BaseButton @click="onContinueToCheckout" :loading="isSaving">continue to checkout →</BaseButton>
            </div>
        </div>

        <!-- BODY -->
        <div class="body-grid grid grid-cols-1 md:grid-cols-[236px_1fr] lg:grid-cols-[236px_1fr_268px]">

            <!-- LEFT SIDEBAR: TEMPLATES + BRUSH -->
            <aside class="sidebar-left order-2 md:order-1">
                <div class="panel-label">templates</div>
                <div class="template-list">
                    <button
                        v-for="tpl in templates"
                        :key="tpl.key"
                        type="button"
                        :aria-pressed="tpl.selected"
                        @click="applyTemplate(tpl.key)"
                        class="template-btn"
                        :style="{ background: tpl.bg, borderColor: tpl.border }"
                    >
                        <div class="template-icon">{{ tpl.icon }}</div>
                        <span class="template-name">{{ tpl.name }}</span>
                    </button>
                </div>

                <div class="panel-label">brush intensity</div>
                <div class="brush-row">
                    <button
                        v-for="lvl in brushLevels"
                        :key="lvl.lvl"
                        type="button"
                        :aria-pressed="lvl.selected"
                        :aria-label="'intensity level ' + lvl.lvl"
                        @click="brush = lvl.lvl"
                        class="brush-btn"
                        :style="{ background: lvl.bg, borderColor: lvl.border }"
                    ></button>
                </div>

                <div class="panel-label">actions</div>
                <div class="action-list">
                    <BaseButton variant="secondary" @click="onClear" class="sidebar-action-btn">clear grid</BaseButton>
                    <BaseButton variant="secondary" @click="onRandomize" class="sidebar-action-btn">randomize noise</BaseButton>
                </div>
            </aside>

            <!-- CENTER: CANVAS -->
            <main class="canvas-main order-1 md:order-2">
                <div class="canvas-wrap">
                    <div class="canvas-header">
                        <div class="canvas-title">{{ activeTabLabel }} contribution graph · starts {{ anchorDateLabel }}</div>
                        <div class="canvas-hint">drag to paint · click to cycle intensity</div>
                    </div>
                    <BaseCard padding="28px 26px 24px">
                        <div class="grid-scroll-wrap">
                            <div class="grid-inner">
                                <div class="month-labels">
                                    <span
                                        v-for="m in months"
                                        :key="m.col"
                                        class="month-label"
                                        :style="{ gridColumn: m.col + ' / span 4' }"
                                    >{{ m.label }}</span>
                                </div>
                                <!-- Known accessibility gap: cells are mouse/touch-only (mousedown+mouseenter
                                     drag-paint) - painting this grid via keyboard isn't supported. Giving each
                                     of the ~370 cells its own tab stop isn't a real fix either. A proper fix
                                     needs roving-tabindex arrow-key focus + Enter/Space to cycle intensity,
                                     which is a larger feature than this pass's layout/labeling scope covers. -->
                                <div class="grid-row">
                                    <div class="weekday-col">
                                        <span class="weekday-label row-2">mon</span>
                                        <span class="weekday-label row-4">wed</span>
                                        <span class="weekday-label row-6">fri</span>
                                    </div>
                                    <div
                                        role="group"
                                        :aria-label="'contribution graph editor, ' + painted + ' of ' + grid.length + ' squares painted'"
                                        @mousedown="painting = true"
                                        @mouseup="painting = false"
                                        @mouseleave="painting = false"
                                        class="grid-cells-wrap"
                                    >
                                        <div
                                            v-for="cell in cells"
                                            :key="cell.idx"
                                            data-testid="grid-cell"
                                            :title="cell.title"
                                            @mousedown="onCellDown(cell.paintIdx)"
                                            @mouseenter="onCellEnter(cell.paintIdx)"
                                            class="grid-cell"
                                            :style="{ background: cell.bg, opacity: cell.opacity }"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-if="customRangeEnabled" class="range-note-wrap">
                            <CustomRangeSlider v-model:start="rangeStart" v-model:end="rangeEnd" :max="WEEKS - 1" />
                            <div class="range-hint">columns outside the range show a dimmed preview of the repeated pattern — paint anywhere and it maps back into your selection.</div>
                        </div>
                        <GridLegend :swatch-size="11" />
                    </BaseCard>
                </div>
            </main>

            <!-- RIGHT SIDEBAR: STATS + CHARITY PREVIEW -->
            <aside class="sidebar-right order-3 md:col-span-2 lg:col-span-1">
                <div class="panel-label panel-label--tight">design name</div>
                <input v-model="designName" placeholder="untitled design" class="design-name-input" />

                <div class="panel-label panel-label--stats">design stats</div>
                <div class="stats-box">
                    <div class="stats-row"><span class="stats-label">squares painted</span><span class="stats-value">{{ painted }} / {{ grid.length }}</span></div>
                    <div class="stats-row"><span class="stats-label">estimated commits</span><span class="stats-value">{{ commitCount }}</span></div>
                </div>

                <div class="panel-label panel-label--stats">supporting</div>
                <div class="charity-box">
                    <div class="charity-avatar">{{ defaultCharityLetter }}</div>
                    <div>
                        <div class="charity-name">{{ defaultCharityLabel }}</div>
                        <RouterLink to="/settings" class="charity-link">change charity</RouterLink>
                    </div>
                </div>

                <div class="panel-label panel-label--stats">visibility</div>
                <div class="toggle-box">
                    <div>
                        <div class="toggle-title">share to gallery</div>
                        <div class="toggle-sub">visible to community</div>
                    </div>
                    <ToggleSwitch data-testid="visibility-toggle" :checked="publicOptIn" @click="onTogglePublic" />
                </div>
                <div v-if="showPrivacyWarning" class="warning-box">
                    <div class="warning-text">{{ otherUsersCount }} other {{ otherUsersCount === 1 ? "user has" : "users have" }} this design active. Making it private won't stop their commits, but they'll no longer be able to see its content. Make it private anyway?</div>
                    <div class="warning-actions">
                        <BaseButton variant="secondary" @click="cancelMakePrivate" class="warning-cancel">cancel</BaseButton>
                        <BaseButton @click="confirmMakePrivate" class="warning-confirm">make private</BaseButton>
                    </div>
                </div>

                <div class="panel-label panel-label--section">recurrence</div>
                <div class="toggle-box">
                    <div>
                        <div class="toggle-title">repeat every year</div>
                        <div class="toggle-sub">auto-repaints this design indefinitely on future years</div>
                    </div>
                    <ToggleSwitch :checked="repeatEveryYear" @click="toggleRepeatEveryYear" />
                </div>
                <div v-if="repeatEveryYear" class="recurrence-detail">
                    <div class="duration-btn-row">
                        <button @click="setRecurrenceIndefinite" :style="indefiniteButtonStyle">indefinitely</button>
                        <button @click="setRecurrenceUntil" :style="untilButtonStyle">end date</button>
                    </div>
                    <div v-if="repeatIndefinitely" class="duration-indefinite">
                        <span>∞</span><span>renews from {{ activeTabLabel }} → forever, until you cancel</span>
                    </div>
                    <input
                        v-else
                        type="date"
                        v-model="recurrenceEndDate"
                        class="date-input"
                    />
                </div>

                <div class="panel-label panel-label--section">custom range</div>
                <div class="toggle-box">
                    <div>
                        <div class="toggle-title">select custom range</div>
                        <div class="toggle-sub">paint a short pattern, repeat it across the grid</div>
                    </div>
                    <ToggleSwitch :checked="customRangeEnabled" @click="toggleCustomRange" />
                </div>
                <div v-if="customRangeEnabled" class="recurrence-detail">
                    <div class="duration-btn-row">
                        <button @click="setRecurrenceIndefinite" :style="indefiniteButtonStyle">indefinitely</button>
                        <button @click="setRecurrenceUntil" :style="untilButtonStyle">end date</button>
                    </div>
                    <div v-if="repeatIndefinitely" class="duration-indefinite">
                        <span>∞</span><span>repeats from {{ activeTabLabel }} → forever, until you cancel</span>
                    </div>
                    <input
                        v-else
                        type="date"
                        v-model="recurrenceEndDate"
                        class="date-input"
                    />
                </div>
            </aside>
        </div>
    </div>
</template>

<style scoped>
    .page {
        font-family: var(--font-sans);
        background: var(--color-bg);
        color: var(--color-text);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    .sub-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px clamp(16px, 3vw, 32px);
        border-bottom: 1px solid var(--color-border);
        flex-wrap: wrap;
        gap: 12px;
    }

    .sub-bar-left {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-4);
    }

    .divider {
        width: 1px;
        height: 14px;
        background: var(--color-border-input);
    }

    .draft-label {
        color: var(--color-text-muted-1);
    }

    .tabs-wrap {
        display: flex;
        align-items: center;
        gap: 4px;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 3px;
    }

    .tab-btn {
        font-family: var(--font-mono);
        font-size: 12.5px;
        font-weight: 600;
        border: none;
        border-radius: 6px;
        padding: 8px 14px;
        cursor: pointer;
    }

    .sub-bar-right {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .save-error {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-danger);
    }

    .save-btn {
        font-size: 13.5px;
        background: var(--color-bg-raised);
        color: var(--color-text-muted-1);
        /* close to --color-border-input (0.12) but a deliberately softer one-off outline */
        border: 1px solid oklch(100% 0 0 / 0.14);
        border-radius: 7px;
        padding: 10px 18px;
    }

    .body-grid {
        flex: 1;
        min-height: 0;
    }

    .sidebar-left {
        border-right: 1px solid var(--color-border);
        padding: 22px 18px;
        overflow-y: auto;
    }

    .panel-label {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-5);
        letter-spacing: 0.04em;
        margin-bottom: 12px;
    }

    .panel-label--tight {
        margin-bottom: 10px;
    }

    .panel-label--stats {
        margin-bottom: 14px;
    }

    .panel-label--section {
        margin: 24px 0 14px;
    }

    .template-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 28px;
    }

    .template-btn {
        width: 100%;
        box-sizing: border-box;
        text-align: left;
        font-family: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border-radius: 8px;
        border-width: 1px;
        border-style: solid;
    }

    .template-icon {
        flex: none;
        width: 26px;
        height: 26px;
        border-radius: 6px;
        background: var(--color-bg-chip);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
    }

    .template-name {
        font-family: var(--font-mono);
        font-size: 12.5px;
    }

    .brush-row {
        display: flex;
        gap: 8px;
        margin-bottom: 24px;
    }

    .brush-btn {
        width: 30px;
        height: 30px;
        border-radius: 6px;
        cursor: pointer;
        border-width: 2px;
        border-style: solid;
        padding: 0;
    }

    .action-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .sidebar-action-btn {
        font-size: 12.5px;
        background: var(--color-bg-raised);
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-mid);
        border-radius: 7px;
        padding: 9px 12px;
        text-align: left;
    }

    .canvas-main {
        padding: clamp(20px, 3vw, 44px);
        overflow: auto;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .canvas-wrap {
        width: 100%;
        max-width: 980px;
    }

    .canvas-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 20px;
    }

    .canvas-title {
        font-family: var(--font-mono);
        font-size: 14px;
        color: var(--color-text-muted-1);
    }

    .canvas-hint {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-5);
    }

    .grid-scroll-wrap {
        overflow-x: auto;
    }

    .grid-inner {
        min-width: 360px;
    }

    .month-labels {
        display: grid;
        grid-template-columns: repeat(53, 1fr);
        gap: clamp(2px, 0.35vw, 4px);
        margin-bottom: 8px;
        padding-left: 32px;
    }

    .month-label {
        font: 500 10.5px var(--font-mono);
        color: var(--color-text-muted-5);
    }

    .grid-row {
        display: flex;
        gap: 8px;
        align-items: stretch;
    }

    .weekday-col {
        flex: none;
        width: 26px;
        display: grid;
        grid-template-rows: repeat(7, 1fr);
        align-items: center;
        padding: 2px 0;
    }

    .weekday-label {
        font: 500 10px var(--font-mono);
        color: var(--color-text-muted-5);
    }

    .row-2 {
        grid-row: 2;
    }

    .row-4 {
        grid-row: 4;
    }

    .row-6 {
        grid-row: 6;
    }

    .grid-cells-wrap {
        flex: 1;
        min-width: 0;
        display: grid;
        grid-template-columns: repeat(53, 1fr);
        grid-template-rows: repeat(7, 1fr);
        grid-auto-flow: column;
        gap: clamp(2px, 0.35vw, 4px);
        aspect-ratio: 53 / 7.6;
        user-select: none;
    }

    .grid-cell {
        border-radius: 2px;
        cursor: pointer;
    }

    .range-note-wrap {
        margin-top: 18px;
        padding-left: 34px;
    }

    .range-hint {
        font-size: 11.5px;
        line-height: 1.5;
        color: var(--color-text-muted-5);
        margin-top: 12px;
    }

    .sidebar-right {
        border-left: 1px solid var(--color-border);
        padding: 22px 20px;
        overflow-y: auto;
    }

    .design-name-input {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--font-mono);
        font-size: 13px;
        background: var(--color-bg-raised);
        color: var(--color-text);
        border: 1px solid var(--color-border-mid);
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 24px;
    }

    .stats-box {
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 24px;
    }

    .stats-row {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 13px;
        margin-bottom: 10px;
    }

    .stats-row:last-child {
        margin-bottom: 0;
    }

    .stats-label {
        color: var(--color-text-muted-4);
    }

    .stats-value {
        font-weight: 600;
    }

    .charity-box {
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 14px;
        border-radius: 10px;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
        margin-bottom: 24px;
    }

    .charity-avatar {
        flex: none;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: var(--color-bg-chip);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-weight: 700;
        color: var(--color-accent-bright);
    }

    .charity-name {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 600;
    }

    .charity-link {
        font-family: var(--font-mono);
        font-size: 12px;
    }

    .toggle-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px;
        border-radius: 10px;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
    }

    .toggle-title {
        font-family: var(--font-mono);
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 2px;
    }

    .toggle-sub {
        font-size: 11.5px;
        color: var(--color-text-muted-5);
    }

    .warning-box {
        margin-top: 10px;
        padding: 14px;
        border-radius: 10px;
        /* intentional one-off orange/red "make private" warning tint - doesn't
           cleanly match --color-danger or --color-warning, kept local */
        background: oklch(24% 0.05 30 / 0.25);
        border: 1px solid oklch(70% 0.18 30 / 0.4);
    }

    .warning-text {
        font-size: 12.5px;
        line-height: 1.5;
        margin-bottom: 10px;
    }

    .warning-actions {
        display: flex;
        gap: 8px;
    }

    .warning-cancel {
        font-size: 12px;
        background: var(--color-bg-inset);
        color: var(--color-text-muted-1);
        border: 1px solid var(--color-border-mid);
        border-radius: 6px;
        padding: 8px 14px;
    }

    .warning-confirm {
        font-size: 12px;
        border-radius: 6px;
        padding: 8px 14px;
    }

    .recurrence-detail {
        margin-top: 10px;
    }

    .duration-btn-row {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
    }

    .duration-indefinite {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-accent-bright);
    }

    .date-input {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--font-mono);
        font-size: 12.5px;
        background: var(--color-bg-inset);
        color: var(--color-text);
        border: 1px solid var(--color-border-input);
        border-radius: 7px;
        padding: 9px 10px;
    }
</style>
