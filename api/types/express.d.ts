export {};

declare global {
    namespace Express {
        interface Request {
            // populated by auth.middleware's requireAuth once the signed session cookie is verified
            user?: {
                id: string;
            };
        }
    }
}
