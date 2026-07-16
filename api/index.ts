import app from "./app";
import { config } from "./config/config";

const port = Number(config.REST_PORT) || 3000;
const server = app.listen(port, () => {
    console.log(`REST server up on port [${port}]`);
});

export default server;
