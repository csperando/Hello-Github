export interface iResponse {
    status: Number;
    success: Boolean;
    message?: String;
    error?: String | Error | null;
    data?: any[];
}
