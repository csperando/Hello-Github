<script setup lang="ts">
import { ref, computed } from 'vue'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import CharityListItem from '@/components/ui/CharityListItem.vue'
import { GetDatesArray, GetMonthLabelColumns } from '@/helpers/dates'
import { LEVEL_COLORS } from '@/helpers/grid'

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
  { name: 'GiveDirectly', focus: 'Cash transfers to families in poverty', letter: 'G' },
  { name: 'Khan Academy', focus: 'Free education for anyone, anywhere', letter: 'K' },
  { name: 'EFF', focus: 'Defending digital rights & privacy', letter: 'E' },
  { name: 'The Trevor Project', focus: 'Crisis support for LGBTQ+ youth', letter: 'T' },
  { name: 'Rainforest Trust', focus: 'Protecting critical habitats', letter: 'R' },
  { name: 'Code.org', focus: 'Computer science education for kids', letter: 'C' },
]

const GALLERY = [
  { user: '@lena.codes', likes: 341, charity: 'GiveDirectly' },
  { user: '@devrim', likes: 118, charity: 'Code.org' },
  { user: '@octomom', likes: 902, charity: 'Rainforest Trust' },
  { user: '@kzhu', likes: 76, charity: 'EFF' },
  { user: '@ravi.b', likes: 214, charity: 'Khan Academy' },
  { user: '@mona', likes: 55, charity: 'The Trevor Project' },
]

const STEPS = [
  { n: '01', title: 'Design', body: 'Paint your pattern on a real contribution grid — click a square to cycle through intensity levels.' },
  { n: '02', title: 'Commit', body: 'We generate the exact backdated commits, or a PR you review, so the art lands on your real GitHub profile.' },
  { n: '03', title: 'Give', body: 'Pay a small flat fee to cover the infra. Everything else goes straight to the charity you picked.' },
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
    borderColor: i === 0 ? 'oklch(58% 0.16 145 / 0.6)' : 'oklch(100% 0 0 / 0.08)',
  })),
)
const gallery = GALLERY
const steps = STEPS
</script>

<template>
  <div style="font-family:'IBM Plex Sans',sans-serif;background:oklch(14% 0.012 250);color:oklch(96% 0.004 250);min-height:100vh;">

    <!-- NAV -->
    <AppNavbar sticky show-links>
      <template #links>
        <a href="#how" style="color:oklch(85% 0.006 250);">how it works</a>
        <a href="#give" style="color:oklch(85% 0.006 250);">pricing</a>
        <a href="#community" style="color:oklch(85% 0.006 250);">community</a>
      </template>
      <template #actions>
        <BaseButton variant="secondary" style="font-size:13.5px;color:oklch(94% 0.004 250);border:1px solid oklch(100% 0 0 / 0.18);border-radius:6px;padding:8px 14px;">sign in</BaseButton>
        <BaseButton as="router-link" to="/signup" style="font-size:13.5px;border-radius:6px;padding:9px 16px;text-decoration:none;">connect github →</BaseButton>
      </template>
    </AppNavbar>

    <!-- HERO -->
    <section style="position:relative;overflow:hidden;padding:clamp(56px,8vw,110px) clamp(20px,4vw,48px) 70px;background-image:radial-gradient(oklch(100% 0 0 / 0.05) 1px, transparent 1px);background-size:22px 22px;">
      <div style="max-width:1240px;margin:0 auto;display:grid;grid-template-columns:1.05fr 1fr;gap:56px;align-items:center;">
        <div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:18px;letter-spacing:0.02em;">// a nonprofit sa[a]s for developers</div>
          <h1 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(34px,4.4vw,58px);line-height:1.05;font-weight:700;margin:0 0 22px;letter-spacing:-0.01em;">Paint pixel art<br>on your <span style="color:oklch(72% 0.16 145);">GitHub graph</span>.<br>Fund something real.</h1>
          <p style="font-family:'IBM Plex Sans',sans-serif;font-size:18px;line-height:1.6;color:oklch(78% 0.008 250);max-width:480px;margin:0 0 34px;">Design a pattern on your contribution grid, we turn it into real commits on your profile — a flat fee covers our costs, everything else goes to the charity you pick.</p>
          <div style="display:flex;gap:14px;flex-wrap:wrap;">
            <BaseButton as="router-link" to="/signup" style="font-size:15px;border-radius:8px;padding:15px 24px;text-decoration:none;">start designing — it's free to try</BaseButton>
            <BaseButton as="a" href="#how" variant="secondary" style="font-weight:500;font-size:15px;color:oklch(94% 0.004 250);border:1px solid oklch(100% 0 0 / 0.18);border-radius:8px;padding:15px 24px;">see how it works ↓</BaseButton>
          </div>
          <div style="display:flex;gap:clamp(20px,4vw,44px);margin-top:52px;flex-wrap:wrap;">
            <div><div style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:22px;">$182,400+</div><div style="font-size:13px;color:oklch(65% 0.01 250);margin-top:2px;">donated to charity</div></div>
            <div><div style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:22px;">6,400+</div><div style="font-size:13px;color:oklch(65% 0.01 250);margin-top:2px;">graphs designed</div></div>
            <div><div style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:22px;">1,200+</div><div style="font-size:13px;color:oklch(65% 0.01 250);margin-top:2px;">charities supported</div></div>
          </div>
        </div>

        <!-- INTERACTIVE GRID EDITOR -->
        <BaseCard padding="26px 24px 22px" style="min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;">
            <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(78% 0.008 250);">{{ painted }} <span style="color:oklch(55% 0.01 250);">/ {{ total }} squares painted</span></div>
            <BaseButton variant="secondary" @click="resetGrid" style="font-size:12px;border:1px solid oklch(100% 0 0 / 0.16);color:oklch(75% 0.008 250);border-radius:6px;padding:6px 10px;">clear grid</BaseButton>
          </div>
          <div style="width:100%;">
            <div style="display:grid;grid-template-columns:repeat(53, 1fr);gap:clamp(1px,0.3vw,3px);margin-bottom:6px;padding-left:26px;">
              <span
                v-for="m in months"
                :key="m.label"
                :style="{ gridColumn: m.col + ' / ' + m.colEnd, font: '500 9px IBM Plex Mono, monospace', color: 'oklch(55% 0.01 250)' }"
              >{{ m.label }}</span>
            </div>
            <div style="display:flex;gap:6px;align-items:stretch;">
              <div style="flex:none;width:20px;display:flex;flex-direction:column;justify-content:space-between;padding:2px 0;">
                <span style="font:500 8.5px 'IBM Plex Mono',monospace;color:oklch(55% 0.01 250);">mon</span>
                <span style="font:500 8.5px 'IBM Plex Mono',monospace;color:oklch(55% 0.01 250);">wed</span>
                <span style="font:500 8.5px 'IBM Plex Mono',monospace;color:oklch(55% 0.01 250);">fri</span>
              </div>
              <div style="flex:1;min-width:0;display:grid;grid-template-columns:repeat(53, 1fr);grid-template-rows:repeat(7, 1fr);grid-auto-flow:column;gap:clamp(1px,0.3vw,3px);aspect-ratio:53/7.6;">
                <div
                  v-for="cell in cells"
                  :key="cell.idx"
                  @click="toggleCell(cell.idx)"
                  :style="{ borderRadius: '2px', cursor: 'pointer', background: cell.bg }"
                ></div>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:16px;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:oklch(55% 0.01 250);">
            <span>less</span>
            <span style="width:10px;height:10px;border-radius:2px;background:oklch(24% 0.01 250);display:inline-block;"></span>
            <span style="width:10px;height:10px;border-radius:2px;background:oklch(32% 0.07 145);display:inline-block;"></span>
            <span style="width:10px;height:10px;border-radius:2px;background:oklch(45% 0.12 145);display:inline-block;"></span>
            <span style="width:10px;height:10px;border-radius:2px;background:oklch(58% 0.16 145);display:inline-block;"></span>
            <span style="width:10px;height:10px;border-radius:2px;background:oklch(72% 0.19 145);display:inline-block;"></span>
            <span>more</span>
            <span style="margin-left:auto;color:oklch(65% 0.01 250);">click a square to paint</span>
          </div>
        </BaseCard>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section id="how" style="padding:clamp(70px,8vw,120px) clamp(20px,4vw,48px);border-top:1px solid oklch(100% 0 0 / 0.08);">
      <div style="max-width:1100px;margin:0 auto;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:12px;">// how it works</div>
        <h2 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(26px,3vw,38px);font-weight:700;margin:0 0 48px;max-width:640px;">Three steps between an idea and a good deed.</h2>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:36px;">
          <div v-for="step in steps" :key="step.n" style="border-top:2px solid oklch(58% 0.16 145);padding-top:20px;">
            <div style="font-family:'IBM Plex Mono',monospace;font-size:32px;font-weight:700;color:oklch(38% 0.02 250);margin-bottom:14px;">{{ step.n }}</div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:600;margin-bottom:10px;">{{ step.title }}</div>
            <div style="font-size:15px;line-height:1.6;color:oklch(75% 0.008 250);">{{ step.body }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- CHARITY / PRICING -->
    <section id="give" style="padding:clamp(70px,8vw,120px) clamp(20px,4vw,48px);background:oklch(17% 0.012 250);border-top:1px solid oklch(100% 0 0 / 0.08);border-bottom:1px solid oklch(100% 0 0 / 0.08);">
      <div style="max-width:1100px;margin:0 auto;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:12px;">// where the money goes</div>
        <h2 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(26px,3vw,38px);font-weight:700;margin:0 0 18px;max-width:640px;">One flat fee. Everything else is a donation.</h2>
        <p style="font-size:16px;line-height:1.7;color:oklch(75% 0.008 250);max-width:600px;margin:0 0 40px;">A $3 flat fee covers hosting and the commits we push on your behalf. Pick any amount above that, and pick where it goes — we cut the check, you keep the receipt.</p>

        <div style="max-width:520px;margin-bottom:56px;">
          <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(70% 0.01 250);margin-bottom:8px;"><span>example: $10 contribution</span><span>$3 fee · $7 to charity</span></div>
          <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;">
            <div style="width:70%;background:oklch(58% 0.16 145);"></div>
            <div style="width:30%;background:oklch(38% 0.02 250);"></div>
          </div>
        </div>

        <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(70% 0.01 250);margin-bottom:16px;">choose a charity —</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
          <CharityListItem
            v-for="charity in charities"
            :key="charity.name"
            :name="charity.name"
            :letter="charity.letter"
            :focus="charity.focus"
            :border-color="charity.borderColor"
          />
        </div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(55% 0.01 250);margin-top:18px;">…or search any registered 501(c)(3) at checkout.</div>
      </div>
    </section>

    <!-- COMMUNITY -->
    <section id="community" style="padding:clamp(70px,8vw,120px) clamp(20px,4vw,48px);">
      <div style="max-width:1100px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:20px;margin-bottom:44px;">
          <div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(72% 0.16 145);margin-bottom:12px;">// the gallery</div>
            <h2 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(26px,3vw,38px);font-weight:700;margin:0;max-width:560px;">Some devs paint privately. Some show their work off.</h2>
          </div>
          <BaseButton variant="secondary" style="font-size:13.5px;border:1px solid oklch(100% 0 0 / 0.18);color:oklch(94% 0.004 250);border-radius:8px;padding:11px 18px;white-space:nowrap;">browse the gallery →</BaseButton>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
          <div v-for="post in gallery" :key="post.user" style="border-radius:12px;overflow:hidden;background:oklch(19% 0.012 250);border:1px solid oklch(100% 0 0 / 0.08);">
            <div style="height:70px;background-image:repeating-linear-gradient(45deg, oklch(26% 0.015 250), oklch(26% 0.015 250) 8px, oklch(22% 0.013 250) 8px, oklch(22% 0.013 250) 16px);display:flex;align-items:center;justify-content:center;">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:oklch(55% 0.01 250);">[ user's grid design ]</span>
            </div>
            <div style="padding:14px 16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-family:'IBM Plex Mono',monospace;font-size:13.5px;font-weight:600;">{{ post.user }}</span>
                <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:oklch(65% 0.01 250);">{{ post.likes }} likes</span>
              </div>
              <div style="display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:oklch(72% 0.16 145);background:oklch(72% 0.16 145 / 0.12);border-radius:5px;padding:4px 8px;">gave to {{ post.charity }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FINAL CTA -->
    <section style="padding:clamp(64px,7vw,100px) clamp(20px,4vw,48px);background:oklch(58% 0.16 145);color:oklch(14% 0.03 145);text-align:center;">
      <div style="max-width:700px;margin:0 auto;">
        <h2 style="font-family:'IBM Plex Mono',monospace;font-size:clamp(26px,3.6vw,42px);font-weight:700;margin:0 0 20px;">git commit -m "did some good"</h2>
        <p style="font-size:16.5px;line-height:1.6;margin:0 0 32px;opacity:0.85;">Connect your GitHub, paint something worth looking at, send a little money somewhere it matters.</p>
        <RouterLink to="/signup" style="font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:15px;background:oklch(14% 0.03 145);color:oklch(90% 0.1 145);border:none;border-radius:8px;padding:16px 26px;cursor:pointer;text-decoration:none;">connect github →</RouterLink>
      </div>
    </section>

    <!-- FOOTER -->
    <footer style="padding:36px clamp(20px,4vw,48px);border-top:1px solid oklch(100% 0 0 / 0.08);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:oklch(55% 0.01 250);">commitment_ — made for open source &amp; good causes</div>
      <div style="display:flex;gap:24px;font-family:'IBM Plex Mono',monospace;font-size:13px;">
        <a href="#how" style="color:oklch(65% 0.01 250);">how it works</a>
        <a href="#give" style="color:oklch(65% 0.01 250);">pricing</a>
        <a href="#community" style="color:oklch(65% 0.01 250);">community</a>
      </div>
    </footer>

  </div>
</template>
