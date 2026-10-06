import { resolve } from "node:path";
import { createHttpServer } from "./http.js";
import { loadPi } from "./pi.js";
import { openRuntime } from "./runtime.js";

const host = process.env.TENGU_HOST ?? "127.0.0.1";
const port = Number(process.env.TENGU_PORT ?? "8787");
const state = resolve(process.env.TENGU_STATE ?? ".tengu/tengu.sqlite");
const workspace = resolve(process.env.TENGU_WORKSPACE ?? ".tengu/workspace");
const publicDirectory = resolve(process.env.TENGU_PUBLIC ?? "dist");
const home = resolve(process.env.TENGU_HOME ?? ".tengu/home");

const runtime = await openRuntime({ database: state, workspace, ...await loadPi(home) });
const server = createHttpServer(runtime, publicDirectory);

server.listen(port, host, () => {
  console.log(`tengu listening on http://${host}:${port}`);
});

const close = async () => {
  server.close();
  await runtime.close();
};

process.once("SIGINT", close);
process.once("SIGTERM", close);
