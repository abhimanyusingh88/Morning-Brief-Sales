export type Row = Record<string, unknown>;

/** Run one parameterised statement ($1, $2 …) and get rows back. */
export type Q = <T = Row>(text: string, params?: unknown[]) => Promise<T[]>;

export interface Db {
  /** Runs inside a transaction evaluated as the signed-in person: row-level security applies. */
  asUser<T>(profileId: string, fn: (q: Q) => Promise<T>): Promise<T>;
  /** Pipeline / admin only. Bypasses row-level security. */
  asService<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  /** Apply any migrations in supabase/migrations that have not run yet. Returns the file names applied. */
  migrate?(): Promise<string[]>;
  close(): Promise<void>;
}
