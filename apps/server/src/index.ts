import "dotenv/config";
import { createLedNodeApp } from "./app.js";

const port = Number(process.env.PORT ?? 41238);
const host = process.env.HOST ?? "0.0.0.0";
const { httpServer } = createLedNodeApp();

httpServer.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`LED MESSENGER NODE server listening on http://${host}:${port}`);
});
