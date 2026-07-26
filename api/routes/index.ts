import { Express } from "express";
import bodyParser from "body-parser";

import ping from "./ping.routes";
import user from "./users.routes";
import org from "./orgs.routes";
import auth from "./auth.routes";
import design from "./designs.routes";

const router = (server: Express) => {
    server.use(bodyParser.json());
    server.use("/", ping);
    server.use("/user", user);
    server.use("/org", org);
    server.use("/auth", auth);
    server.use("/design", design);
}

export default router;
