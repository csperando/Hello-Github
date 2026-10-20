// ---- admin console response serializers ------------------------------------
// Allowlists, like the public serializers: a column added to a table later
// stays server-side until it's deliberately listed here. Admins see more
// than users do (Stripe ids, notes, errors), never tokens or secrets.

/** A payment, as the admin console lists and edits it. */
export function toAdminPayment(p: any) {
    return {
        id: p.id,
        user_id: p.user_id,
        github_username: p.github_username,
        user_email: p.user_email,
        kind: p.kind,
        status: p.status,
        refund_state: p.refund_state,
        amount_total_cents: p.amount_total_cents,
        amount_platform_cents: p.amount_platform_cents,
        amount_charity_cents: p.amount_charity_cents,
        amount_refunded_cents: p.amount_refunded_cents,
        charity_ein_id: p.charity_ein_id,
        charity_name: p.charity_name,
        design_name: p.design_name,
        design_year: p.design_year,
        stripe_object_id: p.stripe_object_id,
        stripe_refund_id: p.stripe_refund_id,
        refunded_at: p.refunded_at,
        admin_note: p.admin_note,
        created_at: p.created_at,
    };
}

/** A paint job, including its own copy of what it paints. */
export function toAdminJob(j: any) {
    return {
        id: j.id,
        selection_id: j.selection_id,
        user_id: j.user_id,
        github_username: j.github_username,
        design_id: j.design_id,
        design_name: j.design_name,
        year: j.year,
        status: j.status,
        status_label: j.status_label,
        pattern: j.pattern,
        start_date: j.start_date,
        custom_range: j.custom_range,
        issue_url: j.issue_url,
        last_error: j.last_error,
        stripe_payment_intent_id: j.stripe_payment_intent_id,
        created_at: j.created_at,
        updated_at: j.updated_at,
        completed_at: j.completed_at,
    };
}

/** A row of the admin user list. */
export function toAdminUserSummary(u: any) {
    return {
        id: u.id,
        github_username: u.github_username,
        display_name: u.display_name,
        email: u.email,
        role: u.role,
        is_active: u.is_active,
        created_at: u.created_at,
        contributed_cents: u.contributed_cents,
    };
}

/** One of a user's design selections - deleted ones included, for restoring. */
export function toAdminUserDesign(d: any) {
    return {
        id: d.id,
        design_id: d.design_id,
        name: d.name,
        year: d.year,
        start_date: d.start_date,
        custom_range: d.custom_range,
        paint_status: d.paint_status,
        deleted_at: d.deleted_at,
        design_owner_id: d.design_owner_id,
        design_deleted_at: d.design_deleted_at,
    };
}

/** GET /admin/users/:id's shape. */
export function toAdminUserDetail(detail: { user: any; designs: any[]; payments: any[]; contributed_cents: number }) {
    const u = detail.user;
    return {
        user: {
            id: u.id,
            github_id: u.github_id,
            github_username: u.github_username,
            github_profile_url: u.github_profile_url,
            avatar_url: u.avatar_url,
            name: u.name,
            display_name: u.display_name,
            email: u.email,
            role: u.role,
            is_active: u.is_active,
            default_charity: u.default_charity,
            created_at: u.created_at,
        },
        designs: detail.designs.map(toAdminUserDesign),
        payments: detail.payments.map(toAdminPayment),
        contributed_cents: detail.contributed_cents,
    };
}
