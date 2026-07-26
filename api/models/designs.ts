export interface iDesign {
    id: String; // uuid
    user_id: String; // uuid, FK -> users.id

    name: String;
    is_public: Boolean;

    start_date: String; // date
    end_date: String; // date

    pattern: Number[]; // 0-4 per cell, length a multiple of 7

    repeat_indefinitely: Boolean;
    recurrence_end_date?: String; // date; null unless repeat_indefinitely is false

    created_at?: String;
    updated_at?: String;
}

export interface iDesignCreateInput {
    name?: String;
    is_public?: Boolean;
    start_date: String;
    end_date: String;
    pattern: Number[];
    repeat_indefinitely?: Boolean;
    recurrence_end_date?: String;
}

export interface iDesignUpdateInput {
    name?: String;
    is_public?: Boolean;
    start_date?: String;
    end_date?: String;
    pattern?: Number[];
    repeat_indefinitely?: Boolean;
    recurrence_end_date?: String;
}
