import { openDB } from 'idb';
import type { ContentBundle } from '../types';

const DB_NAME = 'te-animas-v281';
const STORE = 'content';
const ACTIVE_KEY = 'active';

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    },
  });
}

export async function readCachedContent(): Promise<ContentBundle | null> {
  try {
    const database = await db();
    return (await database.get(STORE, ACTIVE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function writeCachedContent(bundle: ContentBundle): Promise<void> {
  const database = await db();
  await database.put(STORE, bundle, ACTIVE_KEY);
}

export async function clearCachedContent(): Promise<void> {
  const database = await db();
  await database.delete(STORE, ACTIVE_KEY);
}
