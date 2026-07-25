#!/usr/bin/env node
/**
 * JSON-RPC method allowlist proxy for the public demo chain.
 *
 * Anvil is a dev node: its RPC exposes cheat methods (anvil_setBalance,
 * anvil_reset, evm_*, hardhat_*) that would let anyone grief the demo chain.
 * Bind anvil to 127.0.0.1 and expose ONLY this proxy publicly (via Caddy).
 * The app's server-side routes (faucet, realm signer, trader) keep talking to
 * anvil directly over loopback, so the faucet cheat still works server-side.
 *
 * Allowed: standard read/broadcast namespaces (eth_*, net_*, web3_*) plus
 * ots_* — Otterscan's read-only explorer API, which anvil serves natively
 * (the namespace has no mutating methods). Everything else gets a JSON-RPC
 * error. Batches are filtered per-entry.
 *
 * Zero dependencies. Usage:
 *   node deploy/rpc-guard.mjs            # listens on :8546 -> 127.0.0.1:8545
 *   LISTEN_PORT=9000 UPSTREAM=http://127.0.0.1:8545 node deploy/rpc-guard.mjs
 */
import http from "node:http";

const LISTEN_PORT = Number(process.env.LISTEN_PORT ?? 8546);
const LISTEN_HOST = process.env.LISTEN_HOST ?? "127.0.0.1";
const UPSTREAM = new URL(process.env.UPSTREAM ?? "http://127.0.0.1:8545");
const MAX_BODY = 512 * 1024; // generous for eth_call payloads, blocks abuse

const ALLOWED = /^(eth|net|web3|ots)_[a-zA-Z0-9]+$/;
// Otterscan's client probes erigon_getHeaderByNumber on startup; without it the
// explorer reports "It does not seem to be an ETH node" and never connects.
// anvil implements exactly this one method from the erigon_ namespace and it is
// read-only (returns a block header), so allow it by name rather than opening
// the namespace to the mutating methods a real erigon would expose.
const ALLOWED_EXTRA = new Set(["erigon_getHeaderByNumber"]);
// Standard-namespace methods that still mutate node-wide dev state — none in
// eth_*/net_*/web3_* on anvil mutate beyond normal tx submission, which is the
// point of the demo (users send real txs). Explicitly deny subscriptions over
// HTTP anyway; they only work on websockets.
const DENIED = new Set(["eth_subscribe", "eth_unsubscribe"]);

const allowed = (m) =>
  typeof m === "string" && (ALLOWED.test(m) || ALLOWED_EXTRA.has(m)) && !DENIED.has(m);
const rpcError = (id, msg) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code: -32601, message: msg },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method !== "POST") {
    res.writeHead(405, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify(rpcError(null, "POST only")));
  }

  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      res.writeHead(413, { ...CORS, "Content-Type": "application/json" });
      res.end(JSON.stringify(rpcError(null, "payload too large")));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => {
    if (res.writableEnded) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify(rpcError(null, "invalid JSON")));
    }

    const entries = Array.isArray(body) ? body : [body];
    const blocked = entries.find((e) => !allowed(e?.method));
    if (blocked) {
      // Log it: a client silently failing against the allowlist (e.g. Otterscan
      // probing an erigon_ method) is otherwise invisible — journalctl -u
      // realms-rpc-guard names the method instead of leaving you guessing.
      console.log(`blocked: ${blocked?.method}`);
      // Reject the whole request; a partial batch would desync client ids.
      res.writeHead(403, { ...CORS, "Content-Type": "application/json" });
      return res.end(
        JSON.stringify(
          rpcError(blocked?.id, `method not allowed on public demo RPC: ${blocked?.method}`),
        ),
      );
    }

    const payload = JSON.stringify(body);
    const up = http.request(
      {
        hostname: UPSTREAM.hostname,
        port: UPSTREAM.port,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, {
          ...CORS,
          "Content-Type": upRes.headers["content-type"] ?? "application/json",
        });
        upRes.pipe(res);
      },
    );
    up.on("error", () => {
      if (!res.writableEnded) {
        res.writeHead(502, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify(rpcError(null, "upstream unavailable")));
      }
    });
    up.end(payload);
  });
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `rpc-guard listening on ${LISTEN_HOST}:${LISTEN_PORT} -> ${UPSTREAM.href} (eth_/net_/web3_/ots_ only)`,
  );
});
