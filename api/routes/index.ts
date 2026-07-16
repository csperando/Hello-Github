import { Express } from "express";
import bodyParser from "body-parser";

import ping from "./pingRoutes";

const router = (server: Express) => {
    server.use(bodyParser.json());
    server.use("/", ping);
}

export default router;
