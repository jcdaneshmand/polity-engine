import type { LogEntry, Server, State, StorageAPI } from "boardgame.io";
import { inspectGameStateCompatibility, type GameStateCompatibility } from "../../engine/src/game/version";
import { getBoardgameServerPackage } from "./boardgameServer";

type Storage = StorageAPI.Sync | StorageAPI.Async;
type QueuedFlatFile = { fileQueues?: Record<string, Promise<unknown>> };
type GuardedStorage = Storage & { readonly polityDelegate: Storage };

export type BoardgameStorage = GuardedStorage;
export const INCOMPATIBLE_MATCH_STATE_CODE = "POLITY_INCOMPATIBLE_MATCH_STATE";

export class IncompatibleMatchStateError extends Error {
  readonly code = INCOMPATIBLE_MATCH_STATE_CODE;

  constructor(readonly compatibility: Exclude<GameStateCompatibility, { kind: "current" }>) {
    super("This match is incompatible with the current rules engine and is read-only.");
    this.name = "IncompatibleMatchStateError";
  }
}

function assertCompatibleState(state: unknown): void {
  const compatibility = inspectGameStateCompatibility((state as { G?: unknown } | undefined)?.G);
  if (compatibility.kind !== "current") throw new IncompatibleMatchStateError(compatibility);
}

function validateFetchedState(result: unknown, opts: StorageAPI.FetchOpts): void {
  if (!result || typeof result !== "object") return;
  const fetched = result as { state?: unknown; initialState?: unknown };
  if (opts.state && fetched.state !== undefined) assertCompatibleState(fetched.state);
  if (opts.initialState && fetched.initialState !== undefined) assertCompatibleState(fetched.initialState);
}

class InMemoryStorage implements StorageAPI.Sync {
  private readonly states = new Map<string, State>();
  private readonly initialStates = new Map<string, State>();
  private readonly metadata = new Map<string, Server.MatchData>();
  private readonly logs = new Map<string, LogEntry[]>();

  type() { return 0 as const; }
  connect() {}

  createMatch(matchID: string, opts: StorageAPI.CreateMatchOpts): void {
    this.initialStates.set(matchID, opts.initialState);
    this.states.set(matchID, opts.initialState);
    this.metadata.set(matchID, opts.metadata);
  }

  setState(matchID: string, state: State, deltalog?: LogEntry[]): void {
    this.states.set(matchID, state);
    if (deltalog?.length) this.logs.set(matchID, [...(this.logs.get(matchID) ?? []), ...deltalog]);
  }

  setMetadata(matchID: string, metadata: Server.MatchData): void { this.metadata.set(matchID, metadata); }

  fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O): StorageAPI.FetchResult<O> {
    const result: Record<string, unknown> = {};
    if (opts.state) result.state = this.states.get(matchID);
    if (opts.initialState) result.initialState = this.initialStates.get(matchID);
    if (opts.metadata) result.metadata = this.metadata.get(matchID);
    if (opts.log) result.log = this.logs.get(matchID) ?? [];
    return result as StorageAPI.FetchResult<O>;
  }

  wipe(matchID: string): void {
    this.states.delete(matchID);
    this.initialStates.delete(matchID);
    this.metadata.delete(matchID);
    this.logs.delete(matchID);
  }

  listMatches(opts?: StorageAPI.ListMatchesOpts): string[] {
    return [...this.metadata.entries()]
      .filter(([, metadata]) => {
        if (opts?.gameName !== undefined && metadata.gameName !== opts.gameName) return false;
        if (opts?.where?.isGameover !== undefined && (metadata.gameover !== undefined) !== opts.where.isGameover) return false;
        if (opts?.where?.updatedBefore !== undefined && metadata.updatedAt >= opts.where.updatedBefore) return false;
        if (opts?.where?.updatedAfter !== undefined && metadata.updatedAt <= opts.where.updatedAfter) return false;
        return true;
      })
      .map(([matchID]) => matchID);
  }
}

class GuardedSyncStorage implements StorageAPI.Sync {
  readonly polityDelegate: StorageAPI.Sync;

  constructor(delegate: StorageAPI.Sync) { this.polityDelegate = delegate; }
  type() { return 0 as const; }
  connect() { return this.polityDelegate.connect(); }

  createMatch(matchID: string, opts: StorageAPI.CreateMatchOpts): void {
    assertCompatibleState(opts.initialState);
    this.polityDelegate.createMatch(matchID, opts);
  }

  setState(matchID: string, state: State, deltalog?: LogEntry[]): void {
    this.assertStoredStateCompatible(matchID);
    assertCompatibleState(state);
    this.polityDelegate.setState(matchID, state, deltalog);
  }

  setMetadata(matchID: string, metadata: Server.MatchData): void {
    this.assertStoredStateCompatible(matchID);
    this.polityDelegate.setMetadata(matchID, metadata);
  }

  fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O): StorageAPI.FetchResult<O> {
    const result = this.polityDelegate.fetch(matchID, opts);
    validateFetchedState(result, opts);
    return result;
  }

  wipe(matchID: string): void { this.polityDelegate.wipe(matchID); }
  listMatches(opts?: StorageAPI.ListMatchesOpts): string[] { return this.polityDelegate.listMatches(opts); }

  private assertStoredStateCompatible(matchID: string): void {
    const { state } = this.polityDelegate.fetch(matchID, { state: true });
    if (state !== undefined) assertCompatibleState(state);
  }
}

class GuardedAsyncStorage implements StorageAPI.Async {
  readonly polityDelegate: StorageAPI.Async;

  constructor(delegate: StorageAPI.Async) { this.polityDelegate = delegate; }
  type() { return 1 as const; }
  connect() { return this.polityDelegate.connect(); }

  async createMatch(matchID: string, opts: StorageAPI.CreateMatchOpts): Promise<void> {
    assertCompatibleState(opts.initialState);
    await this.polityDelegate.createMatch(matchID, opts);
  }

  async setState(matchID: string, state: State, deltalog?: LogEntry[]): Promise<void> {
    await this.assertStoredStateCompatible(matchID);
    assertCompatibleState(state);
    await this.polityDelegate.setState(matchID, state, deltalog);
  }

  async setMetadata(matchID: string, metadata: Server.MatchData): Promise<void> {
    await this.assertStoredStateCompatible(matchID);
    await this.polityDelegate.setMetadata(matchID, metadata);
  }

  async fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O): Promise<StorageAPI.FetchResult<O>> {
    const result = await this.polityDelegate.fetch(matchID, opts);
    validateFetchedState(result, opts);
    return result;
  }

  async wipe(matchID: string): Promise<void> { await this.polityDelegate.wipe(matchID); }
  async listMatches(opts?: StorageAPI.ListMatchesOpts): Promise<string[]> { return this.polityDelegate.listMatches(opts); }

  private async assertStoredStateCompatible(matchID: string): Promise<void> {
    const { state } = await this.polityDelegate.fetch(matchID, { state: true });
    if (state !== undefined) assertCompatibleState(state);
  }
}

export function guardBoardgameStorage(storage: Storage): BoardgameStorage {
  return (storage.type() === 0
    ? new GuardedSyncStorage(storage as StorageAPI.Sync)
    : new GuardedAsyncStorage(storage as StorageAPI.Async)) as BoardgameStorage;
}

export function createBoardgameStorage(storageDir: string | undefined): BoardgameStorage {
  if (!storageDir) return guardBoardgameStorage(new InMemoryStorage());
  const { FlatFile } = getBoardgameServerPackage();
  return guardBoardgameStorage(new FlatFile({ dir: storageDir }));
}

export function fetchBoardgameMatchForRecovery<O extends StorageAPI.FetchOpts>(storage: BoardgameStorage, matchID: string, opts: O): StorageAPI.FetchResult<O> | Promise<StorageAPI.FetchResult<O>> {
  return storage.polityDelegate.fetch(matchID, opts) as StorageAPI.FetchResult<O> | Promise<StorageAPI.FetchResult<O>>;
}

export async function readBoardgameMatchCompatibility(storage: BoardgameStorage, matchID: string): Promise<"compatible" | "incompatible" | "missing"> {
  const { state } = await storage.polityDelegate.fetch(matchID, { state: true });
  if (state === undefined) return "missing";
  return inspectGameStateCompatibility((state as { G?: unknown }).G).kind === "current" ? "compatible" : "incompatible";
}

export async function waitForBoardgameStorageIdle(storage: BoardgameStorage | undefined): Promise<void> {
  if (!storage) return;
  const queuedStorage = storage.polityDelegate as QueuedFlatFile;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const entries = Object.entries(queuedStorage.fileQueues ?? {});
    if (entries.length === 0) return;
    await Promise.allSettled(entries.map(([, queue]) => queue));
    const currentQueues = queuedStorage.fileQueues ?? {};
    if (Object.keys(currentQueues).length === entries.length && entries.every(([key, queue]) => currentQueues[key] === queue)) return;
  }
}
