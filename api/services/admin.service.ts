import { withTransaction } from "../config/db";
import PaymentsRepository from "../repository/payments.repo";
import type { iAdminPaymentFilters } from "../repository/payments.repo";
import BackfillJobsRepository from "../repository/backfillJobs.repo";
import UserRepository from "../repository/users.repo";
import UserProfileRepository from "../repository/userProfiles.repo";
import DesignSelectionsRepository from "../repository/designSelections.repo";
import DesignsRepository from "../repository/designs.repo";
import AdminAuditRepository from "../repository/adminAudit.repo";
import { isUniqueViolationOn } from "../repository/dbErrors";
import { ADMIN_JOB_FILTERS, iAdminJobFilter } from "../models/backfillJobs";
import { extractRefundInput, extractAdminUserUpdate } from "./admin.validation";

const LOCKING_INDEX = "idx_backfill_jobs_one_locking_per_selection";

/**
 * An admin request that can't be carried out as asked - the admin routes
 * answer with `status` and this message.
 */
export class AdminActionError extends Error {
    constructor(public status: 400 | 404 | 409, message: string) {
        super(message);
        this.name = "AdminActionError";
    }
}

/** One line of a record's history: an admin change, or an event from its own timestamps. */
export interface iHistoryEntry {
    what: string;
    when: string;
    by: string | null;
    changes?: Record<string, unknown>;
}

/** {"field": {"from", "to"}} for every field whose value differs. */
function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(after)) {
        const from = before[key] ?? null;
        const to = after[key] ?? null;
        if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
    }
    return changes;
}

function auditEntries(rows: any[]): iHistoryEntry[] {
    return rows.map((row) => ({ what: row.action, when: row.created_at, by: row.admin_username, changes: row.changes }));
}

function newestFirst(entries: iHistoryEntry[]): iHistoryEntry[] {
    return [...entries].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}

export class AdminService {
    public paymentsRepo: any;
    public jobsRepo: any;
    public usersRepo: any;
    public profilesRepo: any;
    public selectionsRepo: any;
    public designsRepo: any;
    public auditRepo: any;

    constructor() {
        this.paymentsRepo = PaymentsRepository.repo();
        this.jobsRepo = BackfillJobsRepository.repo();
        this.usersRepo = UserRepository.repo();
        this.profilesRepo = UserProfileRepository.repo();
        this.selectionsRepo = DesignSelectionsRepository.repo();
        this.designsRepo = DesignsRepository.repo();
        this.auditRepo = AdminAuditRepository.repo();
    }

    // ---- payments ---------------------------------------------------------

    public async listPayments(filters: iAdminPaymentFilters): Promise<any[]> {
        return this.paymentsRepo.adminList(filters);
    }

    /** Records a refund made in Stripe (moves no money) and logs it, together. */
    public async recordRefund(adminId: string, paymentId: string, body: Record<string, unknown>): Promise<any> {
        const payment = await this.paymentsRepo.adminGetById(paymentId);
        if (!payment) throw new AdminActionError(404, "Payment not found.");

        const { input, error } = extractRefundInput(body, payment.amount_total_cents);
        if (error) throw new AdminActionError(400, error);

        await withTransaction(async (client) => {
            const updated = await this.paymentsRepo.recordRefund(paymentId, input!, client);
            const changes = diff(
                {
                    amount_refunded_cents: payment.amount_refunded_cents,
                    refunded_at: payment.refunded_at ? new Date(payment.refunded_at).toISOString().slice(0, 10) : null,
                    stripe_refund_id: payment.stripe_refund_id,
                    admin_note: payment.admin_note,
                },
                {
                    amount_refunded_cents: updated.amount_refunded_cents,
                    refunded_at: input!.refunded_at,
                    stripe_refund_id: updated.stripe_refund_id,
                    admin_note: updated.admin_note,
                },
            );
            await this.auditRepo.create(
                { admin_user_id: adminId, entity_type: "payment", entity_id: paymentId, action: "refund recorded", changes },
                client,
            );
        });

        return this.paymentsRepo.adminGetById(paymentId);
    }

    public async paymentHistory(paymentId: string): Promise<iHistoryEntry[]> {
        const payment = await this.paymentsRepo.adminGetById(paymentId);
        if (!payment) throw new AdminActionError(404, "Payment not found.");

        const audit = await this.auditRepo.listFor("payment", paymentId);
        return newestFirst([
            ...auditEntries(audit),
            { what: "payment received", when: payment.created_at, by: null },
        ]);
    }

    // ---- paint jobs -------------------------------------------------------

    /** The jobs in a filter (null = all), plus how many jobs each filter holds. */
    public async listJobs(filter: iAdminJobFilter | null): Promise<{ jobs: any[]; counts: Record<string, number> }> {
        const statuses = filter ? ADMIN_JOB_FILTERS[filter] : null;
        const [jobs, byStatus] = await Promise.all([this.jobsRepo.adminList(statuses), this.jobsRepo.adminCountsByStatus()]);

        const counts: Record<string, number> = { all: 0 };
        for (const count of Object.values(byStatus) as number[]) counts.all! += count;
        for (const [name, filterStatuses] of Object.entries(ADMIN_JOB_FILTERS)) {
            counts[name] = filterStatuses.reduce((sum: number, status: string) => sum + (byStatus[status] ?? 0), 0);
        }
        return { jobs, counts };
    }

    public async getJob(jobId: string): Promise<any> {
        const job = await this.jobsRepo.adminGetById(jobId);
        if (!job) throw new AdminActionError(404, "Paint job not found.");
        return job;
    }

    /** failed -> back in the queue, repainting from its same copy - no new payment. */
    public async retryJob(adminId: string, jobId: string): Promise<any> {
        const job = await this.getJob(jobId);

        try {
            await withTransaction(async (client) => {
                const retried = await this.jobsRepo.retry(jobId, client);
                if (!retried) throw new AdminActionError(409, `Only a failed paint can be retried - this one is ${job.status}.`);
                await this.auditRepo.create(
                    {
                        admin_user_id: adminId,
                        entity_type: "backfill_job",
                        entity_id: jobId,
                        action: "retried",
                        changes: { status: { from: job.status, to: retried.status }, last_error: { from: job.last_error, to: null } },
                    },
                    client,
                );
            });
        } catch (err) {
            if (isUniqueViolationOn(err, LOCKING_INDEX)) {
                throw new AdminActionError(409, "Another paint of this design is already in progress - retry once it finishes.");
            }
            throw err;
        }

        return this.getJob(jobId);
    }

    public async cancelJob(adminId: string, jobId: string): Promise<any> {
        const job = await this.getJob(jobId);

        await withTransaction(async (client) => {
            const cancelled = await this.jobsRepo.cancel(jobId, client);
            if (!cancelled) {
                throw new AdminActionError(
                    409,
                    job.status === "painting"
                        ? "This paint is in progress - it can't be cancelled until the backfill finishes."
                        : `This paint is already ${job.status}.`,
                );
            }
            await this.auditRepo.create(
                {
                    admin_user_id: adminId,
                    entity_type: "backfill_job",
                    entity_id: jobId,
                    action: "cancelled",
                    changes: { status: { from: job.status, to: "cancelled" } },
                },
                client,
            );
        });

        return this.getJob(jobId);
    }

    public async jobHistory(jobId: string): Promise<iHistoryEntry[]> {
        const job = await this.getJob(jobId);
        const audit = await this.auditRepo.listFor("backfill_job", jobId);

        const events: iHistoryEntry[] = [{ what: "checkout started", when: job.created_at, by: null }];
        if (job.completed_at) events.push({ what: job.status, when: job.completed_at, by: null });
        return newestFirst([...auditEntries(audit), ...events]);
    }

    // ---- users ------------------------------------------------------------

    public async listUsers(search: string | null): Promise<any[]> {
        return this.usersRepo.adminSearch(search);
    }

    /** A user's account, designs (deleted ones too), payments and contributed total. */
    public async getUser(userId: string): Promise<any> {
        const user = await this.usersRepo.getUserById(userId);
        if (!user) throw new AdminActionError(404, "User not found.");

        const [designs, payments] = await Promise.all([
            this.selectionsRepo.adminListForUser(userId),
            this.paymentsRepo.adminList({ userId }),
        ]);
        const contributed_cents = payments.reduce(
            (sum: number, p: { amount_total_cents: number; amount_refunded_cents: number }) =>
                sum + p.amount_total_cents - p.amount_refunded_cents,
            0,
        );
        return { user, designs, payments, contributed_cents };
    }

    public async updateUser(adminId: string, userId: string, body: Record<string, unknown>): Promise<any> {
        const user = await this.usersRepo.getUserById(userId);
        if (!user) throw new AdminActionError(404, "User not found.");

        const { input, error } = extractAdminUserUpdate(body, adminId === userId);
        if (error) throw new AdminActionError(400, error);

        await withTransaction(async (client) => {
            if (input!.role !== undefined || input!.is_active !== undefined) {
                await this.usersRepo.setRoleAndActive(userId, { role: input!.role, is_active: input!.is_active }, client);
            }
            if (input!.display_name !== undefined || input!.default_charity !== undefined) {
                await this.profilesRepo.upsert(
                    userId,
                    { display_name: input!.display_name, default_charity: input!.default_charity },
                    client,
                );
            }
            await this.auditRepo.create(
                {
                    admin_user_id: adminId,
                    entity_type: "user",
                    entity_id: userId,
                    action: "account updated",
                    changes: diff(user, input as Record<string, unknown>),
                },
                client,
            );
        });

        return this.getUser(userId);
    }

    /** Undoes a soft delete: the selection comes back, and the design too if this user owns it. */
    public async restoreDesign(adminId: string, userId: string, designId: string): Promise<any> {
        const design = await this.designsRepo.getById(designId);
        if (!design) throw new AdminActionError(404, "Design not found.");

        await withTransaction(async (client) => {
            const restored = await this.selectionsRepo.restore(userId, designId, client);
            if (!restored) throw new AdminActionError(404, "That user has no deleted selection of this design.");

            const designRestored = design.user_id === userId && !!(await this.designsRepo.restore(designId, client));
            await this.auditRepo.create(
                {
                    admin_user_id: adminId,
                    entity_type: "design_selection",
                    entity_id: restored.id,
                    action: "restored",
                    changes: { design_id: designId, design_restored: designRestored },
                },
                client,
            );
        });

        return this.getUser(userId);
    }
}
