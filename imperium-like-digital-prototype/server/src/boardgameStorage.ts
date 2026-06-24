import { getBoardgameServerPackage } from "./boardgameServer";

type BoardgameServerPackage = ReturnType<typeof getBoardgameServerPackage>;
type BoardgameFlatFile = InstanceType<BoardgameServerPackage["FlatFile"]>;

type QueuedFlatFile = {
  fileQueues?: Record<string, Promise<unknown>>;
};

export type BoardgameStorage = BoardgameFlatFile;

export function createBoardgameStorage(storageDir: string | undefined): BoardgameStorage | undefined {
  if (!storageDir) return undefined;
  const { FlatFile } = getBoardgameServerPackage();
  return new FlatFile({ dir: storageDir });
}

export async function waitForBoardgameStorageIdle(storage: BoardgameStorage | undefined): Promise<void> {
  if (!storage) return;
  const queuedStorage = storage as unknown as QueuedFlatFile;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const entries = Object.entries(queuedStorage.fileQueues ?? {});
    if (entries.length === 0) return;
    await Promise.allSettled(entries.map(([, queue]) => queue));
    const currentQueues = queuedStorage.fileQueues ?? {};
    if (
      Object.keys(currentQueues).length === entries.length &&
      entries.every(([key, queue]) => currentQueues[key] === queue)
    ) {
      return;
    }
  }
}
