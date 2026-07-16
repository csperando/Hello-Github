import { Request } from "express";
import cors, { CorsOptions } from "cors";

// CORS
const whitelist: string[] = ["http://localhost:5173"];
const setCorsOptions = function (req: Request, callback: any) {
    let options = {} as CorsOptions;

    if (whitelist?.indexOf(req.header("Origin") || "") !== -1) {
        options.origin = req.header("Origin");
        options.allowedHeaders = "Content-Type,Authorization,x-auth-token";
    } else {
        options.origin = false;
    }

    callback(null, options);
};

export default cors(setCorsOptions);
