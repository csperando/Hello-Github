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
