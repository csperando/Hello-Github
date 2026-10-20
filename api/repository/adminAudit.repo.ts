import type { PoolClient } from "pg";
import pool from "../config/db";
import { logger } from "../config/logger";

export type iAuditEntityType = "payment" | "backfill_job" | "user" | "design_selection";

export interface iAuditEntry {
    admin_user_id: string;
    entity_type: iAuditEntityType;
    entity_id: string;
    action: string;
    // {"field": {"from": ..., "to": ...}} for edits, or details for actions
    changes?: Record<string, unknown>;
}

// define the type of the return object from the repo() method
export interface iAdminAuditRepo {
    create: (entry: iAuditEntry, client?: PoolClient) => Promise<any>;
    listFor: (entityType: iAuditEntityType, entityId: string) => Promise<any[]>;
}

// main repo init function to be called in the service factories
const repo = (): iAdminAuditRepo => {
    // `client`: the admin change's own transaction, so the change and its
    // audit row commit or roll back together
    const create = async (entry: iAuditEntry, client?: PoolClient) => {
        try {
            const sqlString = `
                INSERT INTO admin_audit_log (admin_user_id, entity_type, entity_id, action, changes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *;
            `;
            const result = await (client ?? pool).query(sqlString, [
                entry.admin_user_id,
                entry.entity_type,
                entry.entity_id,
                entry.action,
                JSON.stringify(entry.changes ?? {}),
            ]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // newest first, with the admin's username for display
    const listFor = async (entityType: iAuditEntityType, entityId: string) => {
        try {
            const sqlString = `
                SELECT a.id
                    , a.action
                    , a.changes
                    , a.created_at
                    , u.github_username AS admin_username
                FROM admin_audit_log a
                JOIN users u ON u.id = a.admin_user_id
                WHERE a.entity_type = $1 AND a.entity_id = $2
                ORDER BY a.created_at DESC;
            `;
            const result = await pool.query(sqlString, [entityType, entityId]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        create,
        listFor,
    }
};

export default { repo };
