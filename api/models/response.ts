export interface iResponse {
    status: Number;
    success: Boolean;
    message?: String;
    error?: string | null;
    errors?: iRequestErrors[] | null;
    data?: any[];
}

export interface iRequestErrors {
    property: String;
    error: string | null;
}
