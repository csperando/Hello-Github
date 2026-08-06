export interface iResponse {
    status: Number;
    success: Boolean;
    message?: String;
    error?: String | Error | null;
    errors?: iRequestErrors[] | null;
    data?: any[];
}

export interface iRequestErrors {
    property: String;
    error: String | Error | null;
}
