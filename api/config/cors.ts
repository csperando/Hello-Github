import { Request } from "express";
import cors, { CorsOptions } from "cors";
import { config } from "./config";

// CORS
const whitelist: string[] = [config.FRONTEND_URL];
const setCorsOptions = function (req: Request, callback: any) {
    let options = {} as CorsOptions;

    if (whitelist?.indexOf(req.header("Origin") || "") !== -1) {
        options.origin = req.header("Origin");
        options.credentials = true;
        options.allowedHeaders = "Content-Type,Authorization,x-auth-token";
    } else {
        options.origin = false;
    }

    callback(null, options);
};

export default cors(setCorsOptions);
