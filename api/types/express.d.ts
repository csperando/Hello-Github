export {};

declare global {
    namespace Express {
        interface Request {
            // populated by auth.middleware's requireAuth once the signed session cookie is verified
            user?: {
                id: string;
                // populated by auth.middleware's requireRole, not requireAuth
                role?: string;
            };
        }
    }
}
