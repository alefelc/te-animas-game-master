// Local-only HTTP smoke test. No real accounts, mail or OpenAI calls.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";

let dependencyUp = true;
let mailUp = true;
let invitations = 0;
const user = { id: "user-a", email: "local@example.test", first_name: "Local", last_name: "Test", status: "active" };
const directus = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (!dependencyUp) { response.writeHead(503).end(JSON.stringify({ errors: [{ message: "Dependency unavailable" }] })); return; }
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/users/me") {
    assert.ok(["Bearer internal-test-token", "Bearer user-test-token"].includes(request.headers.authorization));
    response.end(JSON.stringify({ data: user }));
  } else if (url.pathname === "/items/pc_user_profiles") {
    response.writeHead(503).end(JSON.stringify({ errors: [{ message: "Optional profile unavailable" }] }));
  } else if (url.pathname === "/users/invite") {
    invitations++;
    response.writeHead(mailUp ? 204 : 503).end(mailUp ? undefined : JSON.stringify({ errors: [{ message: "SMTP unavailable" }] }));
  } else if (url.pathname === "/users") {
    response.end(JSON.stringify({ data: request.method === "GET" ? [] : { id: "new-user" } }));
  } else { response.writeHead(404).end("{}"); }
});
directus.listen(0, "127.0.0.1");
await once(directus, "listening");
const portPicker = createServer();
portPicker.listen(0, "127.0.0.1");
await once(portPicker, "listening");
const apiPort = portPicker.address().port;
await new Promise((resolve) => portPicker.close(resolve));
const child = spawn(process.execPath, ["te-animas-game-master-main/dist/server.js"], {
  cwd: new URL("../", import.meta.url),
  env: {
    ...process.env,
    NODE_ENV: "production", PORT: String(apiPort),
    DIRECTUS_URL: `http://127.0.0.1:${directus.address().port}`,
    DIRECTUS_TOKEN: "internal-test-token", OPENAI_API_KEY: "",
    PLAYER_ROLE_ID: "11111111-1111-4111-8111-111111111111",
    COUPLE_INVITE_PEPPER: "", DIAGNOSTIC_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stderr.on("data", (data) => { logs += data.toString(); });
const base = `http://127.0.0.1:${apiPort}`;
const post = (body, authenticated = false) => ({ method: "POST", headers: {
  "Content-Type": "application/json",
  ...(authenticated ? { Authorization: "Bearer user-test-token" } : {}),
}, body: JSON.stringify(body) });

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${logs}`)), 5_000);
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
    child.stdout.on("data", (data) => {
      if (data.toString().includes("escuchando")) { clearTimeout(timer); resolve(); }
    });
  });
  let response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).features, { account_registration: true, couple_invitations: false });
  assert.equal((await fetch(`${base}/ready`)).status, 200);
  dependencyUp = false;
  assert.equal((await fetch(`${base}/ready`)).status, 503);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  dependencyUp = true;

  assert.equal((await fetch(`${base}/v1/game-master/next`, post({}))).status, 401);
  response = await fetch(`${base}/v1/account/me`, { headers: { Authorization: "Bearer user-test-token" } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { user, profile: null, profile_available: false });
  response = await fetch(`${base}/v1/couples/invites`, post({}, true));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "COUPLE_INVITES_NOT_CONFIGURED");

  response = await fetch(`${base}/v1/account/register`, post({ email: "local@example.test", first_name: "Local", last_name: "Test" }));
  assert.equal(response.status, 202);
  assert.deepEqual((await response.json()).data, { accepted: true });
  assert.equal(invitations, 1);
  mailUp = false;
  response = await fetch(`${base}/v1/account/register`, post({ email: "local2@example.test", first_name: "Local", last_name: "Test" }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "ACCOUNT_INVITATION_UNAVAILABLE");
  response = await fetch(`${base}/v1/account/register`, post({}));
  assert.equal(response.status, 422);
  console.log("OK: 10 comprobaciones HTTP de arranque, salud, acceso, perfil e invitaciones (solo servicios locales).");
} finally {
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  if (child.exitCode === null) await exited;
  directus.closeAllConnections();
  await new Promise((resolve) => directus.close(resolve));
}
