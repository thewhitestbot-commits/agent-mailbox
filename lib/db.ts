// One Postgres (DATABASE_URL). Tables create themselves the first time a server copy touches the database:
// once per copy, locked across copies, skipped when the stored version already matches.
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { SCHEMA } from "./schema";


type Client = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> }; // eslint-disable-line
const g = globalThis as unknown as { _pool?: Pool; _mig?: Promise<void> };
const url = () => (process.env.DATABASE_URL || "postgres://localhost:5432/mailbox_dev").replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full");
function pool() {
  if (g._pool) return g._pool;
  const p = new Pool({ connectionString: url(), max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000, keepAlive: true, query_timeout: 55000 });
  p.on("error", () => {});
  return (g._pool = p);
}
const VERSION = createHash("sha1").update(SCHEMA).digest("hex").slice(0, 16);
function migrated() { return (g._mig ??= migrate().catch(e => { g._mig = undefined; throw e; })); }
async function migrate() {
  const c = await pool().connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(hashtext('schema:agent-mailbox'))");
    await c.query("create table if not exists _schema_version (id int primary key default 1, version text not null)");
    const [v] = (await c.query("select version from _schema_version")).rows;
    if (v?.version !== VERSION) {
      await c.query(SCHEMA); 
      await c.query("insert into _schema_version (id, version) values (1, $1) on conflict (id) do update set version = excluded.version", [VERSION]);
    }
    await c.query("commit");
  } catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { c.release(); }
}
export async function q<T = any>(sql: string, args: unknown[] = []) { await migrated(); return (await pool().query(sql, args)).rows as T[]; } // eslint-disable-line
export async function one<T = any>(sql: string, args: unknown[] = []) { return (await q<T>(sql, args))[0] as T | undefined; } // eslint-disable-line
export async function tx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  await migrated();
  const c = await pool().connect();
  try { await c.query("begin"); const r = await fn(c); await c.query("commit"); return r; }
  catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { c.release(); }
}
export async function end() { if (g._pool) await g._pool.end(); g._pool = undefined; g._mig = undefined; }
