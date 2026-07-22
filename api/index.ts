import app from "./app";
import { config } from "./config/config";
import { logger } from "./config/logger";

const port = Number(config.REST_PORT) || 3000;
const server = app.listen(port, () => {
    logger.info(`REST server up on port [${port}]`);
});

export default server;
