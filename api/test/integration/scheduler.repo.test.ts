import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import UserProfileRepository from "../../repository/userProfiles.repo";
import DesignsRepository from "../../repository/designs.repo";
import DesignSelectionsRepository from "../../repository/designSelections.repo";
import RunLogRepository from "../../repository/runLog.repo";
import SchedulerRepository from "../../repository/scheduler.repo";
import { iGitHubUpsertInput } from "../../models/users";

/**
 * Converts a desired UTC offset into a fixed-offset (no-DST) IANA zone name
 * Postgres understands, so tests can deterministically land a user's
 * *current* local hour wherever they need it, regardless of when the test
 * suite actually runs. Etc/GMT's sign convention is inverted from normal
 * usage (Etc/GMT+5 means UTC-5), and Postgres only supports roughly -12..+12
 * meaning the raw offset is normalized into that range first.
 */
function offsetTimezone(utcOffsetHours: number): string {
    let offset = ((utcOffsetHours % 24) + 24) % 24;
    if (offset > 12) offset -= 24;
    const sign = offset <= 0 ? "+" : "-";
    return `Etc/GMT${sign}${Math.abs(offset)}`;
}

function offsetForTargetLocalHour(targetLocalHour: number): number {
    const nowUtcHour = new Date().getUTCHours();
    return targetLocalHour - nowUtcHour;
}

describe("SchedulerRepository.findDueCandidates", () => {
    const usersRepo = UsersRepository.repo();
    const profilesRepo = UserProfileRepository.repo();
    const designsRepo = DesignsRepository.repo();
    const selectionsRepo = DesignSelectionsRepository.repo();
    const runLogRepo = RunLogRepository.repo();
    const schedulerRepo = SchedulerRepository.repo();

    // fixed, out-of-range-for-real-GitHub ids so these tests never collide with real data
    const dueGitHubId = -13;
    const notDueGitHubId = -14;
    const inactiveUserGitHubId = -15;
    const noActiveSelectionGitHubId = -16;
    const allIds = [dueGitHubId, notDueGitHubId, inactiveUserGitHubId, noActiveSelectionGitHubId];

    beforeAll(async () => {
        await runMigrations();
    });

    afterEach(async () => {
        const users = await pool.query("SELECT id FROM users WHERE github_id = ANY($1);", [allIds]);
        const userIds = users.rows.map((r: { id: string }) => r.id);
        if (userIds.length) {
            await pool.query("DELETE FROM run_log WHERE user_id = ANY($1);", [userIds]);
            await pool.query("DELETE FROM design_selections WHERE user_id = ANY($1);", [userIds]);
            await pool.query("DELETE FROM designs WHERE user_id = ANY($1);", [userIds]);
        }
        await pool.query("DELETE FROM users WHERE github_id = ANY($1);", [allIds]);
    });

    async function makeUser(githubId: number, username: string) {
        return usersRepo.upsertFromGitHub({
            github_id: githubId,
            github_username: username,
            github_email: `${username}@example.com`,
            github_noreply_email: `${githubId}+${username}@users.noreply.github.com`,
            github_node_id: `node-${githubId}`,
            github_profile_url: `https://github.com/${username}`,
            avatar_url: `https://avatars.githubusercontent.com/u/${Math.abs(githubId)}?v=4`,
        } as iGitHubUpsertInput);
    }

    it("returns a user whose local time is currently within the window, with an active design selection", async () => {
        const user = await makeUser(dueGitHubId, "octocat-scheduler-due");
        const tz = offsetTimezone(offsetForTargetLocalHour(2));
        await profilesRepo.upsert(user.id, { timezone: tz as any });
        const design = await designsRepo.create(user.id, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        await selectionsRepo.create(user.id, design.id, { start_date: "2026-01-04", is_active: true });

        const candidates = await schedulerRepo.findDueCandidates(0, 4);

        const mine = candidates.find((c: any) => c.user_id === user.id);
        expect(mine).toBeDefined();
        expect(mine.design_id).toBe(design.id);
        expect(mine.pattern).toEqual([0, 1, 2, 3, 4, 0, 0]);
        expect(mine.timezone).toBe(tz);
        expect(mine.start_date).toBe("2026-01-04");
    });

    it("excludes a user whose local time is currently outside the window", async () => {
        const user = await makeUser(notDueGitHubId, "octocat-scheduler-notdue");
        await profilesRepo.upsert(user.id, { timezone: offsetTimezone(offsetForTargetLocalHour(12)) as any });
        const design = await designsRepo.create(user.id, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        await selectionsRepo.create(user.id, design.id, { start_date: "2026-01-04", is_active: true });

        const candidates = await schedulerRepo.findDueCandidates(0, 4);

        expect(candidates.find((c: any) => c.user_id === user.id)).toBeUndefined();
    });

    it("excludes an inactive user even if their local time and selection are otherwise due", async () => {
        const user = await makeUser(inactiveUserGitHubId, "octocat-scheduler-inactive");
        await pool.query("UPDATE users SET is_active = FALSE WHERE id = $1;", [user.id]);
        await profilesRepo.upsert(user.id, { timezone: offsetTimezone(offsetForTargetLocalHour(2)) as any });
        const design = await designsRepo.create(user.id, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        await selectionsRepo.create(user.id, design.id, { start_date: "2026-01-04", is_active: true });

        const candidates = await schedulerRepo.findDueCandidates(0, 4);

        expect(candidates.find((c: any) => c.user_id === user.id)).toBeUndefined();
    });

    it("excludes a due user with no active design selection", async () => {
        const user = await makeUser(noActiveSelectionGitHubId, "octocat-scheduler-noselection");
        await profilesRepo.upsert(user.id, { timezone: offsetTimezone(offsetForTargetLocalHour(2)) as any });
        const design = await designsRepo.create(user.id, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        await selectionsRepo.create(user.id, design.id, { start_date: "2026-01-04", is_active: false });

        const candidates = await schedulerRepo.findDueCandidates(0, 4);

        expect(candidates.find((c: any) => c.user_id === user.id)).toBeUndefined();
    });

    it("excludes a due user who already has a run_log row for their current local date", async () => {
        const user = await makeUser(dueGitHubId, "octocat-scheduler-due");
        const tz = offsetTimezone(offsetForTargetLocalHour(2));
        await profilesRepo.upsert(user.id, { timezone: tz as any });
        const design = await designsRepo.create(user.id, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        await selectionsRepo.create(user.id, design.id, { start_date: "2026-01-04", is_active: true });

        const todayForUser = await pool.query(
            `SELECT (NOW() AT TIME ZONE $1)::date AS today;`,
            [tz],
        );
        await runLogRepo.create({
            user_id: user.id,
            design_id: design.id,
            target_date: todayForUser.rows[0].today,
            commit_count: 3,
            status: "committed",
        });

        const candidates = await schedulerRepo.findDueCandidates(0, 4);

        expect(candidates.find((c: any) => c.user_id === user.id)).toBeUndefined();
    });

    it("uses the real email preference when computing use_real_email on the row", async () => {
        const user = await makeUser(dueGitHubId, "octocat-scheduler-due");
        await profilesRepo.upsert(user.id, {
            timezone: offsetTimezone(offsetForTargetLocalHour(2)) as any,
            use_real_email: true,
        });
        const design = await designsRepo.create(user.id, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        await selectionsRepo.create(user.id, design.id, { start_date: "2026-01-04", is_active: true });

        const candidates = await schedulerRepo.findDueCandidates(0, 4);

        const mine = candidates.find((c: any) => c.user_id === user.id);
        expect(mine.use_real_email).toBe(true);
    });
});
