import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { buildChildEnv, createDevFullController, waitForHTTP } from "./dev-full.mjs";

test("waitForHTTP retries until the endpoint returns ok", async () => {
  const calls = [];
  const waited = [];

  await waitForHTTP("http://127.0.0.1:8000/polity/lobby/rooms", {
    timeoutMs: 1000,
    intervalMs: 10,
    sleep: async (ms) => waited.push(ms),
    fetcher: async (url) => {
      calls.push(url);
      return { ok: calls.length === 3, status: calls.length === 3 ? 200 : 503 };
    },
    now: () => calls.length * 10
  });

  assert.deepEqual(calls, [
    "http://127.0.0.1:8000/polity/lobby/rooms",
    "http://127.0.0.1:8000/polity/lobby/rooms",
    "http://127.0.0.1:8000/polity/lobby/rooms"
  ]);
  assert.deepEqual(waited, [10, 10]);
});

test("dev-full controller stops both child processes", () => {
  const stopped = [];
  const controller = createDevFullController({
    spawnProcess: (name) => ({
      name,
      killed: false,
      kill(signal) {
        this.killed = true;
        stopped.push([this.name, signal]);
        return true;
      }
    })
  });

  controller.startServer();
  controller.startApp();
  controller.stopAll("SIGTERM");

  assert.deepEqual(stopped, [
    ["server", "SIGTERM"],
    ["app", "SIGTERM"]
  ]);
});

test("dev-full controller stops the other process when one exits", () => {
  const children = [];
  const stopped = [];
  const controller = createDevFullController({
    spawnProcess: (name) => {
      const child = new EventEmitter();
      child.name = name;
      child.killed = false;
      child.kill = (signal) => {
        child.killed = true;
        stopped.push([name, signal]);
        return true;
      };
      children.push(child);
      return child;
    }
  });

  controller.startServer();
  controller.startApp();
  children[0].emit("exit", 1);

  assert.deepEqual(stopped, [
    ["server", "SIGTERM"],
    ["app", "SIGTERM"]
  ]);
});

test("buildChildEnv removes duplicate Windows path keys", () => {
  const env = buildChildEnv({ Path: "C:\\Windows", PATH: "C:\\Other" }, { EXTRA: "1" });

  assert.equal(env.Path, "C:\\Windows");
  assert.equal(env.PATH, undefined);
  assert.equal(env.EXTRA, "1");
});
