import { Express } from "express";
import bodyParser from "body-parser";

import ping from "./pingRoutes";
import user from "./userRoutes";

const router = (server: Express) => {
    server.use(bodyParser.json());
    server.use("/", ping);
    server.use("/user", user);
}

export default router;
