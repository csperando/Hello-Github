import app from "../app";
import { logger } from "../config/logger";

const server = app.listen(0, () => {
    logger.info(`Test server up.`);
});

export default server;

