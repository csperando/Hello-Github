<script setup lang="ts">
    import { computed, onMounted, ref } from "vue"
    import { useRoute, useRouter } from "vue-router"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import BaseTextInput from "@/components/ui/BaseTextInput.vue"
    import BaseSelect from "@/components/ui/BaseSelect.vue"
    import ToggleSwitch from "@/components/ui/ToggleSwitch.vue"
    import ConfirmDialog from "@/components/ui/ConfirmDialog.vue"
    import CustomRangeSlider from "@/components/ui/CustomRangeSlider.vue"
    import GridLegend from "@/components/ui/GridLegend.vue"
    import {
        LEVEL_COLORS,
        yearAnchor,
        pastYears,
        toDateString,
        weeksInYear,
        gridCellDate,
        monthLabelWeeks,
        remapGridToYear,
    } from "@/helpers/grid"
    import {
        getDesign,
        getSelectionCount,
        type iDesign,
        type iDesignCreatePayload,
        type iDesignSelection,
    } from "@/services/designs"
    import { useDesignsStore } from "@/stores/designs"
    import { useAuthStore } from "@/stores/auth"

    const DAYS = 7 // row 0 = Sunday, matching stampPattern's idx = week * DAYS + row and GitHub's own week layout
    const MONTH_LABELS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

    type Pattern = number[][]

    function emptyGrid(weeks = weeksInYear(selectedYear.value)): number[] {
        return new Array(weeks * DAYS).fill(0)
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

    // Templates are hidden for now - see the commented-out panel in the left sidebar.
    // const TEMPLATES = [
    //     { key: "blank", name: "Blank canvas", icon: "▢", build: () => emptyGrid() },
    //     { key: "heart", name: "Heart", icon: "♥", build: () => stampPattern(HEART, 19, 4) },
    //     { key: "smiley", name: "Smiley", icon: "☺", build: () => stampPattern(SMILEY, 21, 3) },
    //     { key: "diamond", name: "Diamond", icon: "◆", build: () => stampPattern(DIAMOND, 20, 4) },
    // ]

    // Designs paint a past year only (backfilled in one go after purchase) -
    // the editor offers the last few full years, most recent first.
    const YEARS = pastYears()

    const selectedYear = ref<number>(YEARS[0]!)
    // Week columns in the selected year's grid - 53, or 54 for a leap year starting on a Saturday.
    const weeks = computed(() => weeksInYear(selectedYear.value))
    const grid = ref<number[]>(emptyGrid())
    // const selectedTemplate = ref("heart")
    // Brush intensity is fixed for now - the intensity picker is commented out.
    const BRUSH_LEVEL = 1
    // const brush = ref(4)
    // const painting = ref(false)
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

    // Click-to-cycle and drag-to-paint are disabled for now; a click just toggles a cell on/off.
    // function cycleCell(idx: number) {
    //     const current = grid.value[idx] ?? 0
    //     grid.value[idx] = (current + 1) % 5
    // }

    // function paintCell(idx: number, level: number) {
    //     grid.value[idx] = level
    // }

    // function onCellDown(idx: number) {
    //     painting.value = true
    //     cycleCell(idx)
    // }

    // function onCellEnter(idx: number) {
    //     if (painting.value) paintCell(idx, brush.value)
    // }

    function toggleCell(idx: number) {
        if (!inYear.value[idx]) return
        grid.value[idx] = (grid.value[idx] ?? 0) > 0 ? 0 : BRUSH_LEVEL
    }

    function onClear() {
        grid.value = emptyGrid()
        // selectedTemplate.value = "blank"
    }

    function onRandomize() {
        grid.value = emptyGrid().map((_, idx) => (inYear.value[idx] && Math.random() < 0.35 ? BRUSH_LEVEL : 0))
        // selectedTemplate.value = "blank"
    }

    // function applyTemplate(key: string) {
    //     const tpl = TEMPLATES.find((t) => t.key === key)
    //     if (!tpl) return
    //     grid.value = tpl.build()
    //     selectedTemplate.value = key
    // }

    // The design currently being edited, if the route carries a :designId - see
    // onMounted below. While set, it overrides the tab-based anchor with the
    // selection's own saved start_date, so the grid re-anchors to exactly where
    // it was when saved rather than to "today"/"this year" as of right now.
    // Content (name/is_public/pattern) and scheduling (year/start_date/
    // custom_range) come from two different resources now - loadedDesign is
    // content-only, loadedSelection carries the schedule.
    type LoadedSchedule = Pick<iDesignSelection, "year" | "start_date" | "custom_range">
    const loadedDesign = ref<iDesign | null>(null)
    const loadedSelection = ref<LoadedSchedule | null>(null)

    // The grid's first column is always the most recent Sunday on/before Jan 1
    // of the selected year, matching GitHub's own year layout - including for a
    // loaded design, whose pattern is placed at its start_date's column. Cells
    // at either end that fall in the neighbouring years are shown but can't be
    // painted, since the backfill only paints days inside the selected year.
    const anchorDate = computed(() => yearAnchor(selectedYear.value))

    // Per cell index: its date, and whether that date is inside the selected year.
    const cellDates = computed(() => grid.value.map((_, idx) => gridCellDate(selectedYear.value, Math.floor(idx / DAYS), idx % DAYS)))
    const inYear = computed(() => cellDates.value.map((date) => date.getUTCFullYear() === selectedYear.value))
    const paintableCount = computed(() => inYear.value.filter(Boolean).length)

    // Custom-range tiling always stops at the end of the selected year.
    const yearEndDate = computed(() => `${selectedYear.value}-12-31`)
    const yearEndLabel = computed(() =>
        new Date(`${yearEndDate.value}T00:00:00Z`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
        }),
    )

    // A year picked while the design has paint waits here for the user to
    // confirm - the copy onto the new year's grid can drop squares at its edges.
    const pendingYear = ref<number | null>(null)

    function selectYear(value: string) {
        const year = Number(value)
        if (year === selectedYear.value) return
        if (painted.value > 0) {
            pendingYear.value = year
            return
        }
        changeYear(year)
    }

    function confirmYearChange() {
        if (pendingYear.value !== null) changeYear(pendingYear.value)
        pendingYear.value = null
    }

    function cancelYearChange() {
        pendingYear.value = null
    }

    // Copies the design onto the new year's grid column by column, keeping its
    // position on screen (see remapGridToYear). A loaded design stays loaded -
    // saving moves it to the new year rather than creating a copy.
    function changeYear(year: number) {
        grid.value = remapGridToYear(grid.value, year)
        selectedYear.value = year
        rangeEnd.value = Math.min(rangeEnd.value, weeks.value - 1)
        rangeStart.value = Math.min(rangeStart.value, rangeEnd.value - 1)
    }

    /**
     * Restores editor state from a saved design + the caller's own selection
     * of it - only from fields that state each thing directly: the year, the
     * pattern's start column (start_date), and whether it's a custom range.
     * Nothing is inferred from the pattern's shape.
     */
    function applyLoadedDesign(design: iDesign, selection: LoadedSchedule) {
        loadedDesign.value = design
        loadedSelection.value = selection
        selectedYear.value = selection.year

        designName.value = design.name
        publicOptIn.value = design.is_public

        // The saved pattern starts at start_date's column, not column 0.
        const startWeek = Math.round(
            (new Date(`${selection.start_date}T00:00:00Z`).getTime() - yearAnchor(selectedYear.value).getTime()) / (7 * 86400000),
        )
        const patternWeeks = design.pattern.length / DAYS

        customRangeEnabled.value = selection.custom_range
        if (selection.custom_range) {
            rangeStart.value = startWeek
            rangeEnd.value = startWeek + patternWeeks - 1
        }

        const newGrid = emptyGrid()
        design.pattern.forEach((level, i) => {
            const idx = startWeek * DAYS + i
            if (idx >= 0 && idx < newGrid.length) newGrid[idx] = level
        })
        grid.value = newGrid
        // selectedTemplate.value = "blank"
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

    function cellDateLabel(date: Date): string {
        return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    }

    const cells = computed(() => {
        const rangeWidth = rangeEnd.value - rangeStart.value + 1
        return grid.value.map((level, idx) => {
            const week = Math.floor(idx / DAYS)
            const day = idx % DAYS
            let paintIdx = idx
            let ghost = false
            // A custom range only tiles forward from its start - like the
            // backfill - so columns before it stay empty and unpaintable.
            const beforeRange = customRangeEnabled.value && week < rangeStart.value

            if (customRangeEnabled.value && week > rangeEnd.value) {
                ghost = true
                const relWeek = (week - rangeStart.value) % rangeWidth
                paintIdx = (rangeStart.value + relWeek) * DAYS + day
            }

            const date = cellDates.value[idx]!
            // Paintable only if both this cell and the cell it writes through to
            // (itself, or its in-range source for a ghost cell) are in the year.
            const outside = !inYear.value[idx]
            const paintable = !outside && !beforeRange && !!inYear.value[paintIdx]
            const displayLevel = paintable ? (customRangeEnabled.value ? (grid.value[paintIdx] ?? 0) : level) : 0
            return {
                idx,
                paintIdx,
                date: toDateString(date),
                level: displayLevel,
                outside,
                paintable,
                bg: outside ? "transparent" : (LEVEL_COLORS[displayLevel] ?? LEVEL_COLORS[0]!),
                // dimmed outside the range on both sides - this is what shows where the range is
                opacity: ghost || beforeRange ? 0.38 : 1,
                title: outside ? undefined : cellDateLabel(date),
            }
        })
    })

    // Jan-Dec, each over the column holding that month's 1st (see monthLabelWeeks).
    const months = computed(() =>
        monthLabelWeeks(selectedYear.value).map(({ month, week }) => ({ label: MONTH_LABELS[month]!, col: week + 1 })),
    )

    // const templates = computed(() =>
    //     TEMPLATES.map((t) => ({
    //         key: t.key,
    //         name: t.name,
    //         icon: t.icon,
    //         selected: t.key === selectedTemplate.value,
    //         bg: t.key === selectedTemplate.value ? "var(--color-accent-soft)" : "transparent",
    //         border: t.key === selectedTemplate.value ? "var(--color-accent-border)" : "var(--color-border)",
    //     })),
    // )

    // const brushLevels = computed(() =>
    //     LEVEL_COLORS.map((color, lvl) => ({
    //         lvl,
    //         bg: color,
    //         selected: lvl === brush.value,
    //         border: lvl === brush.value ? "var(--color-text)" : "transparent",
    //     })),
    // )

    const yearOptions = YEARS.map((year) => ({ value: String(year), label: String(year) }))

    const painted = computed(() => grid.value.filter((l) => l > 0).length)
    const commitCount = computed(() => painted.value * BRUSH_LEVEL * 2)

    const router = useRouter()
    const designsStore = useDesignsStore()
    // authStore.user is already populated here: the router's requiresAuth guard
    // (vue/src/router/index.ts) awaits fetchMe() before this route resolves.
    const authStore = useAuthStore()
    const isSaving = ref(false)
    const saveError = ref("")

    // default_charity is now an eo_bmf id, not a name - see the matching note
    // in Dashboard.vue.
    const defaultCharityLabel = computed(() => (authStore.user?.default_charity ? "charity selected" : "no charity selected"))
    const defaultCharityLetter = computed(() => (authStore.user?.default_charity ? "♥" : "–"))

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
            for (let week = 0; week < weeks.value; week++) {
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

        // A custom range tiles through the end of the selected year (the API
        // derives that from year + custom_range); anything else is a one-off.
        // repeat_indefinitely/recurrence_end_date belong to a separate,
        // unimplemented feature and are always left unset.
        const schedule = {
            year: selectedYear.value,
            start_date: extracted.start_date,
            custom_range: customRangeEnabled.value,
            repeat_indefinitely: false,
            recurrence_end_date: null,
        }

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

                const updatedSelection = await designsStore.updateSelectionSchedule(loadedDesign.value.id, schedule)
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
                pattern: extracted.pattern,
                ...schedule,
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

    // "continue to checkout" saves the design first, then goes to checkout
    // carrying the design id (the webhook creates its backfill job once
    // payment settles) and its year (for the checkout copy)
    async function onContinueToCheckout() {
        const saved = await saveDesign()
        if (!saved) return

        const designId = loadedDesign.value?.id
        if (!designId) return

        router.push({ name: "Checkout", query: { designId, year: String(selectedYear.value) } })
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

            <label class="year-picker">
                <span class="year-picker-label">year</span>
                <BaseSelect
                    id="editor-year"
                    :model-value="String(pendingYear ?? selectedYear)"
                    :options="yearOptions"
                    @update:model-value="selectYear"
                />
            </label>

            <div class="sub-bar-right">
                <span v-if="saveError" class="save-error">{{ saveError }}</span>
                <BaseButton
                    variant="secondary"
                    @click="saveDesign"
                    :loading="isSaving"
                    :disabled="isSaving"
                    class="save-btn"
                >{{ loadedDesign ? "save changes" : "save as draft" }}</BaseButton>
                <BaseButton @click="onContinueToCheckout" :loading="isSaving" :disabled="isSaving">continue to checkout →</BaseButton>
            </div>
        </div>

        <!-- BODY -->
        <div class="body-grid grid grid-cols-1 md:grid-cols-[236px_1fr] lg:grid-cols-[236px_1fr_268px]">

            <!-- LEFT SIDEBAR: ACTIONS (templates + brush intensity hidden for now) -->
            <aside class="sidebar-left order-2 md:order-1">
                <!--
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
                -->

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
                        <div class="canvas-title">{{ selectedYear }} contribution graph · starts Jan 1, {{ selectedYear }}</div>
                        <!-- <div class="canvas-hint">drag to paint · click to cycle intensity</div> -->
                    </div>
                    <BaseCard padding="28px 26px 24px">
                        <div class="grid-scroll-wrap">
                            <div class="grid-inner" :style="{ '--weeks': weeks }">
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
                                        :aria-label="'contribution graph editor, ' + painted + ' of ' + paintableCount + ' squares painted'"
                                        class="grid-cells-wrap"
                                    >
                                        <div
                                            v-for="cell in cells"
                                            :key="cell.idx"
                                            data-testid="grid-cell"
                                            :data-date="cell.date"
                                            :data-level="cell.level"
                                            :data-outside-year="cell.outside || undefined"
                                            :title="cell.title"
                                            @mousedown="cell.paintable && toggleCell(cell.paintIdx)"
                                            class="grid-cell"
                                            :class="{ 'grid-cell--disabled': !cell.paintable }"
                                            :style="{ background: cell.bg, opacity: cell.opacity }"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-if="customRangeEnabled" class="range-note-wrap">
                            <CustomRangeSlider v-model:start="rangeStart" v-model:end="rangeEnd" :max="weeks - 1" />
                            <div class="range-hint">columns after the range show a dimmed preview of the pattern repeating through the end of the year — paint there and it maps back into your selection. columns before the range stay empty.</div>
                        </div>
                        <GridLegend :swatch-size="11" />
                    </BaseCard>
                </div>
            </main>

            <!-- RIGHT SIDEBAR: STATS + CHARITY PREVIEW -->
            <aside class="sidebar-right order-3 md:col-span-2 lg:col-span-1">
                <label class="panel-label panel-label--tight" for="editor-design-name">design name</label>
                <BaseTextInput id="editor-design-name" v-model="designName" placeholder="untitled design" variant="compact" />

                <div class="panel-label panel-label--stats">design stats</div>
                <div class="stats-box">
                    <div class="stats-row"><span class="stats-label">squares painted</span><span class="stats-value">{{ painted }} / {{ paintableCount }}</span></div>
                    <!-- <div class="stats-row"><span class="stats-label">estimated commits</span><span class="stats-value">{{ commitCount }}</span></div> -->
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

                <!-- "repeat every year" (forward painting) is hidden while designs paint a past year only
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
                        <span>∞</span><span>renews from {{ selectedYear }} → forever, until you cancel</span>
                    </div>
                    <input
                        v-else
                        type="date"
                        v-model="recurrenceEndDate"
                        class="date-input"
                    />
                </div>
                -->

                <div class="panel-label panel-label--section">custom range</div>
                <div class="toggle-box">
                    <div>
                        <div class="toggle-title">select custom range</div>
                        <div class="toggle-sub">paint a short pattern, repeat it across the grid</div>
                    </div>
                    <ToggleSwitch :checked="customRangeEnabled" @click="toggleCustomRange" />
                </div>
                <div v-if="customRangeEnabled" class="recurrence-detail">
                    <div class="duration-indefinite">
                        <span>↻</span><span>repeats through {{ yearEndLabel }}</span>
                    </div>
                </div>
            </aside>
        </div>

        <ConfirmDialog
            :open="pendingYear !== null"
            :title="`switch to ${pendingYear}?`"
            :confirm-label="`switch to ${pendingYear}`"
            cancel-label="keep editing"
            @confirm="confirmYearChange"
            @cancel="cancelYearChange"
        >
            Your design keeps its place on the grid, but the days under each square change - some of it may shift
            slightly, and any squares that land outside {{ pendingYear }} are removed.
        </ConfirmDialog>
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

    .year-picker {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 150px;
    }

    .year-picker-label {
        font-family: var(--font-mono);
        font-size: 12.5px;
        color: var(--color-text-muted-2);
    }

    .year-picker :deep(.base-select) {
        font-family: var(--font-mono);
        font-size: 12.5px;
        font-weight: 600;
        padding: 8px 12px;
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
        display: block;
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
        grid-template-columns: repeat(var(--weeks), 1fr);
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
        grid-template-columns: repeat(var(--weeks), 1fr);
        grid-template-rows: repeat(7, 1fr);
        grid-auto-flow: column;
        gap: clamp(2px, 0.35vw, 4px);
        aspect-ratio: var(--weeks) / 7.6;
        user-select: none;
    }

    .grid-cell {
        border-radius: 2px;
        cursor: pointer;
    }

    .grid-cell--disabled {
        cursor: default;
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
