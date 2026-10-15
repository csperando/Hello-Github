/**
 * Content only - a design is reusable/shareable, so it carries no scheduling
 * state of its own. Whether/when/how any given user runs it lives on
 * iDesignSelection instead, since multiple users (including non-authors, for
 * public designs) can each run the same pattern on their own timeline.
 */
export interface iDesign {
    id: String; // uuid
    user_id: String; // uuid, FK -> users.id - creator/credit, NOT whose graph gets painted

    name: String;
    is_public: Boolean;

    pattern: Number[]; // 0-4 per cell, length a multiple of 7

    created_at?: String;
    updated_at?: String;
}

export interface iDesignUpdateInput {
    name?: String;
    is_public?: Boolean;
    pattern?: Number[];
}

/**
 * The scheduling logistics for one user's use of one design: when their
 * instance of the pattern starts, whether/how it repeats, and whether it's
 * currently the one running on their graph. At most one active selection is
 * allowed per user (enforced by a partial unique index on the DB side).
 */
export interface iDesignSelection {
    id: String; // uuid
    user_id: String; // uuid, FK -> users.id - whose graph gets painted
    design_id: String; // uuid, FK -> designs.id

    is_active: Boolean;

    start_date: String; // date
    repeat_indefinitely: Boolean;
    recurrence_end_date?: String; // date; null unless repeat_indefinitely is false

    created_at?: String;
    updated_at?: String;
}

/**
 * Body for creating a design: content fields plus the creator's own initial
 * selection, since a design is never created pivot-less.
 */
export interface iDesignCreateInput {
    name?: String;
    is_public?: Boolean;
    pattern: Number[];
    start_date: String;
    repeat_indefinitely?: Boolean;
    recurrence_end_date?: String;
}

export interface iDesignSelectionCreateInput {
    start_date: String;
    repeat_indefinitely?: Boolean;
    recurrence_end_date?: String;
    is_active?: Boolean;
}

export interface iDesignSelectionUpdateInput {
    is_active?: Boolean;
    start_date?: String;
    repeat_indefinitely?: Boolean;
    recurrence_end_date?: String;
}

// ---- response serializers ------------------------------------------------
// Allowlists for what the API sends back - like toPublicUser, a column added
// to a table later stays server-side until it's deliberately listed here.
// Typed as full DB rows (timestamps always present, nullable columns null).

export interface iPublicDesign {
    id: String;
    user_id: String;
    name: String;
    is_public: Boolean;
    pattern: Number[];
    created_at: String;
    updated_at: String;
}

export function toPublicDesign(design: iPublicDesign): iPublicDesign {
    return {
        id: design.id,
        user_id: design.user_id,
        name: design.name,
        is_public: design.is_public,
        pattern: design.pattern,
        created_at: design.created_at,
        updated_at: design.updated_at,
    };
}

export interface iPublicSelection {
    id: String;
    user_id: String;
    design_id: String;
    is_active: Boolean;
    start_date: String;
    repeat_indefinitely: Boolean;
    recurrence_end_date: String | null;
    created_at: String;
    updated_at: String;
}

export function toPublicSelection(selection: iPublicSelection): iPublicSelection {
    return {
        id: selection.id,
        user_id: selection.user_id,
        design_id: selection.design_id,
        is_active: selection.is_active,
        start_date: selection.start_date,
        repeat_indefinitely: selection.repeat_indefinitely,
        recurrence_end_date: selection.recurrence_end_date,
        created_at: selection.created_at,
        updated_at: selection.updated_at,
    };
}

/** A selection joined with the design content it points at - GET /design's list shape. */
export interface iPublicSelectionWithDesign extends iPublicSelection {
    name: String;
    is_public: Boolean;
    pattern: Number[];
    design_owner_id: String;
}

export function toPublicSelectionWithDesign(row: iPublicSelectionWithDesign): iPublicSelectionWithDesign {
    return {
        ...toPublicSelection(row),
        name: row.name,
        is_public: row.is_public,
        pattern: row.pattern,
        design_owner_id: row.design_owner_id,
    };
}

/** The latest run_log entry for one design - GET /design/last-run's shape. */
export interface iPublicRunStatus {
    design_id: String;
    target_date: String;
    commit_count: Number;
    status: String;
    created_at: String;
}

export function toPublicRunStatus(run: iPublicRunStatus): iPublicRunStatus {
    return {
        design_id: run.design_id,
        target_date: run.target_date,
        commit_count: run.commit_count,
        status: run.status,
        created_at: run.created_at,
    };
}
