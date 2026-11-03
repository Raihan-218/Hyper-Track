import * as SQLite from "expo-sqlite";
import { INITIAL_SCHEMA, SCHEMA_VERSION } from "./schema";

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync("hyper-track.db");
      await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      await db.withTransactionAsync(async () => {
        const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
        const version = row?.user_version ?? 0;
        if (version > SCHEMA_VERSION) throw new Error(`Local database version ${version} is newer than this app supports.`);
        if (version < 1) {
          for (const statement of INITIAL_SCHEMA) await db.execAsync(statement);
          await db.execAsync("PRAGMA user_version = 1");
        }
      });
      return db;
    })().catch((error) => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}

export async function runInTransaction<T>(operation: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  let result!: T;
  await db.withTransactionAsync(async () => { result = await operation(db); });
  return result;
}
