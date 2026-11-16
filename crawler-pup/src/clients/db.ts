import type { DbAdapter } from "./db-adapter";
import { PocketBaseAdapter } from "./pocketbase-adapter";
import { SqliteAdapter } from "./sqlite-adapter";

let adapter: DbAdapter | null = null;

export function getAdapter(): DbAdapter {
  if (!adapter) {
    const dbType = process.env.DB_TYPE ?? "pocketbase";
    adapter =
      dbType === "sqlite" ? new SqliteAdapter() : new PocketBaseAdapter();
  }
  return adapter;
}

export function setAdapter(custom: DbAdapter | null): void {
  adapter = custom;
}
