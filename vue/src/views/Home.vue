<script setup lang="ts">
    import { ref, computed } from "vue"
    import AppNavbar from "@/components/layout/AppNavbar.vue"
    import BaseButton from "@/components/ui/BaseButton.vue"
    import BaseCard from "@/components/ui/BaseCard.vue"
    import CharityListItem from "@/components/ui/CharityListItem.vue"
    import GridLegend from "@/components/ui/GridLegend.vue"
    import { GetDatesArray, GetMonthLabelColumns } from "@/helpers/dates"
    import { LEVEL_COLORS } from "@/helpers/grid"

    // TODO: size grid from dates.length once wired to real contribution data
    const WEEKS = 53
    const DAYS = 7
    const dates = GetDatesArray()

    function buildDefaultGrid(): number[] {
        const grid = new Array(WEEKS * DAYS).fill(0)
        for (let i = 0; i < grid.length; i++) {
            if (Math.random() < 0.3) grid[i] = 1 + Math.floor(Math.random() * 2)
        }
        const heart = [
            [0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
            [1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0],
            [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
            [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
            [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
            [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
        ]
        const startWeek = 19
        heart.forEach((row, r) => {
            row.forEach((filled, c) => {
                if (filled) {
                    const week = startWeek + c
                    const idx = week * DAYS + r
                    grid[idx] = 3 + ((r + c) % 2)
                }
            })
        })
        return grid
    }

    const CHARITIES = [
        { name: "GiveDirectly", focus: "Cash transfers to families in poverty", letter: "G" },
        { name: "Khan Academy", focus: "Free education for anyone, anywhere", letter: "K" },
        { name: "EFF", focus: "Defending digital rights & privacy", letter: "E" },
        { name: "The Trevor Project", focus: "Crisis support for LGBTQ+ youth", letter: "T" },
        { name: "Rainforest Trust", focus: "Protecting critical habitats", letter: "R" },
        { name: "Code.org", focus: "Computer science education for kids", letter: "C" },
    ]

    const GALLERY = [
        { user: "@lena.codes", likes: 341, charity: "GiveDirectly" },
        { user: "@devrim", likes: 118, charity: "Code.org" },
        { user: "@octomom", likes: 902, charity: "Rainforest Trust" },
        { user: "@kzhu", likes: 76, charity: "EFF" },
        { user: "@ravi.b", likes: 214, charity: "Khan Academy" },
        { user: "@mona", likes: 55, charity: "The Trevor Project" },
    ]

    const STEPS = [
        { n: "01", title: "Design", body: "Paint your pattern on a real contribution grid — click a square to cycle through intensity levels." },
        { n: "02", title: "Commit", body: "We generate the exact backdated commits, or a PR you review, so the art lands on your real GitHub profile." },
        { n: "03", title: "Give", body: "Pay a small flat fee to cover the infra. Everything else goes straight to the charity you picked." },
    ]

    const grid = ref<number[]>(buildDefaultGrid())

    function toggleCell(idx: number) {
        grid.value[idx] = ((grid.value[idx] ?? 0) + 1) % LEVEL_COLORS.length
    }

    function resetGrid() {
        grid.value = new Array(WEEKS * DAYS).fill(0)
    }

    const cells = computed(() =>
        grid.value.map((level, idx) => ({ idx, level, bg: LEVEL_COLORS[level] })),
    )
    const months = computed(() => GetMonthLabelColumns(dates))
    const painted = computed(() => grid.value.filter((l) => l > 0).length)
    const total = computed(() => grid.value.length)
    const charities = computed(() =>
        CHARITIES.map((c, i) => ({
            ...c,
            borderColor: i === 0 ? "var(--color-accent-border)" : "var(--color-border)",
        })),
    )
    const gallery = GALLERY
    const steps = STEPS
</script>

<template>
    <div class="page">

        <!-- NAV -->
        <AppNavbar />

        <!-- HERO -->
        <section class="hero">
            <div class="hero-inner grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] items-center gap-14">
                <div>
                    <div class="eyebrow eyebrow-hero">// a nonprofit sa[a]s for developers</div>
                    <h1 class="hero-title">Paint pixel art<br>on your <span class="accent-text">GitHub graph</span>.<br>Fund something real.</h1>
                    <p class="hero-sub">Design a pattern on your contribution grid, we turn it into real commits on your profile — a flat fee covers our costs, everything else goes to the charity you pick.</p>
                    <div class="cta-row">
                        <RouterLink to="/signup"><BaseButton class="cta-primary">start designing — it's free to try</BaseButton></RouterLink>
                        <RouterLink to="/#how"><BaseButton variant="secondary" class="cta-secondary">see how it works ↓</BaseButton></RouterLink>
                    </div>
                    <div class="hero-stats">
                        <!-- <div><div class="stat-number">$182,400+</div><div class="stat-label">donated to charity</div></div> -->
                        <div><div class="stat-number">6,400+</div><div class="stat-label">graphs designed</div></div>
                        <div><div class="stat-number">1,200+</div><div class="stat-label">charities supported</div></div>
                    </div>
                </div>

                <!-- INTERACTIVE GRID EDITOR -->
                <BaseCard padding="26px 24px 22px" class="hero-card">
                    <div class="card-header">
                        <div class="painted-count">{{ painted }} <span class="total-count">/ {{ total }} squares painted</span></div>
                        <BaseButton variant="secondary" @click="resetGrid" class="clear-btn">clear grid</BaseButton>
                    </div>
                    <div class="grid-scroll">
                        <div class="grid-inner">
                            <div class="month-labels">
                                <span
                                    v-for="m in months"
                                    :key="m.label"
                                    class="month-label"
                                    :style="{ gridColumn: m.col + ' / ' + m.colEnd }"
                                >{{ m.label }}</span>
                            </div>
                            <div class="grid-row">
                                <div class="weekday-col">
                                    <span class="weekday-label">mon</span>
                                    <span class="weekday-label">wed</span>
                                    <span class="weekday-label">fri</span>
                                </div>
                                <div
                                    role="group"
                                    :aria-label="'contribution graph editor, ' + painted + ' of ' + total + ' squares painted'"
                                    class="grid-cells-wrap"
                                >
                                    <div
                                        v-for="cell in cells"
                                        :key="cell.idx"
                                        class="grid-cell"
                                        @click="toggleCell(cell.idx)"
                                        :style="{ background: cell.bg }"
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <GridLegend :swatch-size="10"><span class="legend-hint">click a square to paint</span></GridLegend>
                </BaseCard>
            </div>
        </section>

        <!-- HOW IT WORKS -->
        <section id="how" class="section-how">
            <div class="section-inner">
                <div class="eyebrow">// how it works</div>
                <h2 class="section-title title-how">Three steps between an idea and a good deed.</h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-9">
                    <div v-for="step in steps" :key="step.n" class="step-card">
                        <div class="step-number">{{ step.n }}</div>
                        <div class="step-title">{{ step.title }}</div>
                        <div class="step-body">{{ step.body }}</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- CHARITY / PRICING -->
        <section id="give" class="section-give">
            <div class="section-inner">
                <div class="eyebrow">// where the money goes</div>
                <h2 class="section-title title-give">One flat fee. Everything else is a donation.</h2>
                <p class="section-copy">A $3 flat fee covers hosting and the commits we push on your behalf. Pick any amount above that, and pick where it goes — we cut the check, you keep the receipt.</p>

                <div class="fee-example">
                    <div class="fee-example-row"><span>example: $10 contribution</span><span>$3 fee · $7 to charity</span></div>
                    <div aria-hidden="true" class="fee-bar">
                        <div class="fee-bar-charity"></div>
                        <div class="fee-bar-fee"></div>
                    </div>
                </div>

                <div class="choose-label">choose a charity —</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <CharityListItem
                        v-for="charity in charities"
                        :key="charity.name"
                        :name="charity.name"
                        :letter="charity.letter"
                        :focus="charity.focus"
                        :border-color="charity.borderColor"
                    />
                </div>
                <div class="search-hint">…or search any registered 501(c)(3) at checkout.</div>
            </div>
        </section>

        <!-- COMMUNITY -->
        <section id="community" class="section-community">
            <div class="section-inner">
                <div class="gallery-header">
                    <div>
                        <div class="eyebrow">// the gallery</div>
                        <h2 class="section-title title-gallery">Some devs paint privately. Some show their work off.</h2>
                    </div>
                    <BaseButton variant="secondary" class="browse-btn">browse the gallery →</BaseButton>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    <div v-for="post in gallery" :key="post.user" class="gallery-card">
                        <div aria-hidden="true" class="gallery-thumb">
                            <span class="gallery-thumb-label">[ user's grid design ]</span>
                        </div>
                        <div class="gallery-body">
                            <div class="gallery-body-header">
                                <span class="gallery-user">{{ post.user }}</span>
                                <span class="gallery-likes">{{ post.likes }} likes</span>
                            </div>
                            <div class="gallery-charity-tag">gave to {{ post.charity }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- FINAL CTA -->
        <section class="section-cta">
            <div class="cta-inner">
                <h2 class="cta-title">git commit -m "did some good"</h2>
                <p class="cta-copy">Connect your GitHub, paint something worth looking at, send a little money somewhere it matters.</p>
                <RouterLink to="/signup" class="cta-link">connect github →</RouterLink>
            </div>
        </section>

        <!-- FOOTER -->
        <footer class="footer">
            <div class="footer-brand">commitment_ — made for open source &amp; good causes</div>
            <div class="footer-links">
                <RouterLink to="/#how" class="footer-link">how it works</RouterLink>
                <RouterLink to="/#give" class="footer-link">pricing</RouterLink>
                <RouterLink to="/#community" class="footer-link">community</RouterLink>
            </div>
        </footer>

    </div>
</template>

<style scoped>
    .page {
        font-family: var(--font-sans);
        background: var(--color-bg);
        color: var(--color-text);
        min-height: 100vh;
    }

    .hero {
        position: relative;
        overflow: hidden;
        padding: clamp(56px, 8vw, 110px) clamp(20px, 4vw, 48px) 70px;
        /* radial-gradient dot texture - distinct low alpha, no matching border/bg token */
        background-image: radial-gradient(oklch(100% 0 0 / 0.05) 1px, transparent 1px);
        background-size: 22px 22px;
    }

    .hero-inner {
        max-width: 1240px;
        margin: 0 auto;
    }

    .eyebrow {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-accent-bright);
        margin-bottom: 12px;
    }

    .eyebrow-hero {
        margin-bottom: 18px;
        letter-spacing: 0.02em;
    }

    .hero-title {
        font-family: var(--font-mono);
        font-size: clamp(34px, 4.4vw, 58px);
        line-height: 1.05;
        font-weight: 700;
        margin: 0 0 22px;
        letter-spacing: -0.01em;
    }

    .accent-text {
        color: var(--color-accent-bright);
    }

    .hero-sub {
        font-family: var(--font-sans);
        font-size: 18px;
        line-height: 1.6;
        color: var(--color-text-muted-2);
        max-width: 480px;
        margin: 0 0 34px;
    }

    .cta-row {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
    }

    .cta-primary {
        font-size: 15px;
        border-radius: 8px;
        padding: 15px 24px;
        text-decoration: none;
    }

    .cta-secondary {
        font-weight: 500;
        font-size: 15px;
        color: var(--color-text);
        border: 1px solid var(--color-border-strong);
        border-radius: 8px;
        padding: 15px 24px;
    }

    .hero-stats {
        display: flex;
        gap: clamp(20px, 4vw, 44px);
        margin-top: 52px;
        flex-wrap: wrap;
    }

    .stat-number {
        font-family: var(--font-mono);
        font-weight: 700;
        font-size: 22px;
    }

    .stat-label {
        font-size: 13px;
        color: var(--color-text-muted-4);
        margin-top: 2px;
    }

    .hero-card {
        min-width: 0;
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 16px;
    }

    .painted-count {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-2);
    }

    .total-count {
        color: var(--color-text-muted-5);
    }

    .clear-btn {
        font-size: 12px;
        /* close to --color-border-strong (0.18) but a deliberately softer one-off outline */
        border: 1px solid oklch(100% 0 0 / 0.16);
        color: var(--color-text-muted-2);
        border-radius: 6px;
        padding: 6px 10px;
    }

    .grid-scroll {
        width: 100%;
        overflow-x: auto;
    }

    .grid-inner {
        min-width: 344px;
    }

    .month-labels {
        display: grid;
        grid-template-columns: repeat(53, 1fr);
        gap: clamp(1px, 0.3vw, 3px);
        margin-bottom: 6px;
        padding-left: 26px;
    }

    .month-label {
        font: 500 9px var(--font-mono);
        color: var(--color-text-muted-5);
    }

    .grid-row {
        display: flex;
        gap: 6px;
        align-items: stretch;
    }

    .weekday-col {
        flex: none;
        width: 20px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 2px 0;
    }

    .weekday-label {
        font: 500 8.5px var(--font-mono);
        color: var(--color-text-muted-5);
    }

    .grid-cells-wrap {
        flex: 1;
        min-width: 0;
        display: grid;
        grid-template-columns: repeat(53, 1fr);
        grid-template-rows: repeat(7, 1fr);
        grid-auto-flow: column;
        gap: clamp(1px, 0.3vw, 3px);
        aspect-ratio: 53 / 7.6;
    }

    .grid-cell {
        border-radius: 2px;
        cursor: pointer;
    }

    .legend-hint {
        margin-left: auto;
        color: var(--color-text-muted-4);
    }

    .section-inner {
        max-width: 1100px;
        margin: 0 auto;
    }

    .section-title {
        font-family: var(--font-mono);
        font-size: clamp(26px, 3vw, 38px);
        font-weight: 700;
    }

    .title-how {
        margin: 0 0 48px;
        max-width: 640px;
    }

    .title-give {
        margin: 0 0 18px;
        max-width: 640px;
    }

    .title-gallery {
        margin: 0;
        max-width: 560px;
    }

    .section-how {
        padding: clamp(70px, 8vw, 120px) clamp(20px, 4vw, 48px);
        border-top: 1px solid var(--color-border);
    }

    .step-card {
        border-top: 2px solid var(--color-accent);
        padding-top: 20px;
    }

    .step-number {
        font-family: var(--font-mono);
        font-size: 32px;
        font-weight: 700;
        /* no matching token - muted numeral tone, shared with the pricing bar's fee segment below */
        color: oklch(38% 0.02 250);
        margin-bottom: 14px;
    }

    .step-title {
        font-family: var(--font-mono);
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 10px;
    }

    .step-body {
        font-size: 15px;
        line-height: 1.6;
        color: var(--color-text-muted-2);
    }

    .section-give {
        padding: clamp(70px, 8vw, 120px) clamp(20px, 4vw, 48px);
        /* between --color-bg-inset (15%) and --color-bg-raised (19%) - no exact token, one-off section wash */
        background: oklch(17% 0.012 250);
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
    }

    .section-copy {
        font-size: 16px;
        line-height: 1.7;
        color: var(--color-text-muted-2);
        max-width: 600px;
        margin: 0 0 40px;
    }

    .fee-example {
        max-width: 520px;
        margin-bottom: 56px;
    }

    .fee-example-row {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-3);
        margin-bottom: 8px;
    }

    .fee-bar {
        display: flex;
        height: 14px;
        border-radius: 7px;
        overflow: hidden;
    }

    .fee-bar-charity {
        width: 70%;
        background: var(--color-accent);
    }

    .fee-bar-fee {
        width: 30%;
        /* no matching token - same muted numeral tone as .step-number */
        background: oklch(38% 0.02 250);
    }

    .choose-label {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-3);
        margin-bottom: 16px;
    }

    .search-hint {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-5);
        margin-top: 18px;
    }

    .section-community {
        padding: clamp(70px, 8vw, 120px) clamp(20px, 4vw, 48px);
    }

    .gallery-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 20px;
        margin-bottom: 44px;
    }

    .browse-btn {
        font-size: 13.5px;
        border: 1px solid var(--color-border-strong);
        color: var(--color-text);
        border-radius: 8px;
        padding: 11px 18px;
        white-space: nowrap;
    }

    .gallery-card {
        border-radius: 12px;
        overflow: hidden;
        background: var(--color-bg-raised);
        border: 1px solid var(--color-border);
    }

    .gallery-thumb {
        height: 70px;
        /* placeholder stripe pattern - two one-off grays, no matching tokens */
        background-image: repeating-linear-gradient(45deg, oklch(26% 0.015 250), oklch(26% 0.015 250) 8px, oklch(22% 0.013 250) 8px, oklch(22% 0.013 250) 16px);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .gallery-thumb-label {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--color-text-muted-5);
    }

    .gallery-body {
        padding: 14px 16px;
    }

    .gallery-body-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }

    .gallery-user {
        font-family: var(--font-mono);
        font-size: 13.5px;
        font-weight: 600;
    }

    .gallery-likes {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--color-text-muted-4);
    }

    .gallery-charity-tag {
        display: inline-block;
        font-family: var(--font-mono);
        font-size: 11.5px;
        color: var(--color-accent-bright);
        background: var(--color-accent-soft);
        border-radius: 5px;
        padding: 4px 8px;
    }

    .section-cta {
        padding: clamp(64px, 7vw, 100px) clamp(20px, 4vw, 48px);
        background: var(--color-accent);
        color: var(--color-accent-on);
        text-align: center;
    }

    .cta-inner {
        max-width: 700px;
        margin: 0 auto;
    }

    .cta-title {
        font-family: var(--font-mono);
        font-size: clamp(26px, 3.6vw, 42px);
        font-weight: 700;
        margin: 0 0 20px;
    }

    .cta-copy {
        font-size: 16.5px;
        line-height: 1.6;
        margin: 0 0 32px;
        opacity: 0.85;
    }

    .cta-link {
        font-family: var(--font-mono);
        font-weight: 600;
        font-size: 15px;
        background: var(--color-accent-on);
        /* bright green-tinted text on the accent-on background - no matching token */
        color: oklch(90% 0.1 145);
        border: none;
        border-radius: 8px;
        padding: 16px 26px;
        cursor: pointer;
        text-decoration: none;
    }

    .footer {
        padding: 36px clamp(20px, 4vw, 48px);
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
    }

    .footer-brand {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--color-text-muted-5);
    }

    .footer-links {
        display: flex;
        gap: 24px;
        font-family: var(--font-mono);
        font-size: 13px;
    }

    .footer-link {
        color: var(--color-text-muted-4);
    }
</style>
