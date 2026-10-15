import { extractCompletionReports, extractBackfillCompletions } from "../../services/scheduler.validation";

describe("extractCompletionReports", () => {
    const validEntry = { user_id: "u1", target_date: "2026-01-04", commit_count: 5, status: "committed" };

    it("accepts a valid array of reports", () => {
        const { input, error } = extractCompletionReports([validEntry]);

        expect(error).toBeUndefined();
        expect(input).toEqual([validEntry]);
    });

    it("accepts an empty array", () => {
        const { input, error } = extractCompletionReports([]);
        expect(error).toBeUndefined();
        expect(input).toEqual([]);
    });

    it("accepts multiple reports", () => {
        const { input, error } = extractCompletionReports([
            validEntry,
            { user_id: "u2", target_date: "2026-01-04", commit_count: 0, status: "failed" },
        ]);
        expect(error).toBeUndefined();
        expect(input).toHaveLength(2);
    });

    it("rejects a non-array body", () => {
        const { error } = extractCompletionReports({ user_id: "u1" });
        expect(error).toBeDefined();
    });

    it("rejects a null/non-object entry", () => {
        expect(extractCompletionReports([null]).error).toBeDefined();
        expect(extractCompletionReports(["not an object"]).error).toBeDefined();
    });

    it("rejects a missing/non-string user_id", () => {
        expect(extractCompletionReports([{ ...validEntry, user_id: undefined }]).error).toBeDefined();
        expect(extractCompletionReports([{ ...validEntry, user_id: 5 }]).error).toBeDefined();
        expect(extractCompletionReports([{ ...validEntry, user_id: "" }]).error).toBeDefined();
    });

    it("rejects an invalid target_date", () => {
        expect(extractCompletionReports([{ ...validEntry, target_date: "not-a-date" }]).error).toBeDefined();
        expect(extractCompletionReports([{ ...validEntry, target_date: 12345 }]).error).toBeDefined();
    });

    it("rejects a non-integer or negative commit_count", () => {
        expect(extractCompletionReports([{ ...validEntry, commit_count: -1 }]).error).toBeDefined();
        expect(extractCompletionReports([{ ...validEntry, commit_count: 1.5 }]).error).toBeDefined();
        expect(extractCompletionReports([{ ...validEntry, commit_count: "5" }]).error).toBeDefined();
    });

    it("accepts commit_count of 0 (a failed run with nothing committed)", () => {
        const { error } = extractCompletionReports([{ ...validEntry, commit_count: 0, status: "failed" }]);
        expect(error).toBeUndefined();
    });

    it("rejects a status outside the allowed set", () => {
        expect(extractCompletionReports([{ ...validEntry, status: "pending" }]).error).toBeDefined();
    });

    it("ignores mass-assignment fields like design_id/id", () => {
        const { input } = extractCompletionReports([{ ...validEntry, id: "attacker-id", design_id: "attacker-design" }]);
        expect((input![0] as any).id).toBeUndefined();
        expect((input![0] as any).design_id).toBeUndefined();
    });

    it("reports which entry index failed, for a mixed valid/invalid batch", () => {
        const { error } = extractCompletionReports([validEntry, { ...validEntry, status: "bogus" }]);
        expect(error).toMatch(/Entry 1/);
    });
});

describe("extractBackfillCompletions", () => {
    it("accepts done and failed outcomes, keeping only job_id and status", () => {
        const { input, error } = extractBackfillCompletions([
            { job_id: "j1", status: "done", extra: "ignored" },
            { job_id: "j2", status: "failed" },
        ]);

        expect(error).toBeUndefined();
        expect(input).toEqual([{ job_id: "j1", status: "done" }, { job_id: "j2", status: "failed" }]);
    });

    it("rejects a non-array body", () => {
        expect(extractBackfillCompletions({ job_id: "j1", status: "done" }).error).toMatch(/array/);
    });

    it("rejects a missing job_id", () => {
        expect(extractBackfillCompletions([{ status: "done" }]).error).toMatch(/job_id/);
    });

    it("rejects a status the Action can't report (e.g. painting)", () => {
        expect(extractBackfillCompletions([{ job_id: "j1", status: "painting" }]).error).toMatch(/status/);
    });
});
