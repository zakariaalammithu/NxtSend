/**
 * In-memory fake of the Supabase service-role client for Integration
 * Hub service tests. Adapted from the OAuth store's fake-admin with
 * two additions the Hub's security tests need:
 *
 *  - `failInsertTables`: inserts/upserts into a listed table return an
 *    error — used to inject an AUDIT-LOG WRITE FAILURE and prove the
 *    strict audit-then-disclose path refuses (500, no value).
 *  - `.or(...)` / `.is(...)` support for the checklist/document
 *    "global OR per-integration" queries.
 *
 * Rows are inspectable via `tables` so tests can assert a planted
 * canary secret appears NOWHERE it shouldn't (including audit rows).
 */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

export interface FakeDbError {
  message: string;
  code: string;
}

export interface QueryResult {
  data: unknown;
  error: FakeDbError | null;
}

export interface FakeSupabase {
  tables: Record<string, Row[]>;
  failInsertTables: Set<string>;
  from: (table: string) => Query;
}

class Query implements PromiseLike<QueryResult> {
  private mode: "select" | "insert" | "update" | "delete" | "upsert" =
    "select";
  private payload: unknown = null;
  private onConflict: string[] = [];
  private filters: Array<(row: Row) => boolean> = [];
  private orderSpec: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(
    private db: FakeSupabase,
    private table: string
  ) {}

  private rows(): Row[] {
    if (!this.db.tables[this.table]) this.db.tables[this.table] = [];
    return this.db.tables[this.table];
  }

  select() {
    return this;
  }
  insert(payload: unknown) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: unknown, opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = payload;
    this.onConflict = (opts?.onConflict ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return this;
  }
  update(payload: unknown) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  or(expr: string) {
    // Supports the Hub's patterns: "col.is.null,col.eq.<value>"
    const parts = expr.split(",");
    const tests: Array<(row: Row) => boolean> = parts.map((part) => {
      const m = part.match(/^([a-z_]+)\.(is|eq)\.(.+)$/);
      if (!m) return () => false;
      const col = m[1];
      const op = m[2];
      const raw = m[3];
      if (op === "is" && raw === "null") return (r: Row) => r[col] == null;
      return (r: Row) => String(r[col]) === raw;
    });
    this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  private applyDefaults(row: Row): Row {
    const nowIso = new Date().toISOString();
    return {
      id: randomUUID(),
      created_at: nowIso,
      updated_at: nowIso,
      ...row,
    };
  }

  private injectedFailure(): QueryResult {
    return {
      data: null,
      error: {
        message: `injected insert failure on ${this.table}`,
        code: "XX000",
      },
    };
  }

  private execute(): QueryResult {
    const rows = this.rows();
    const matches = () => rows.filter((r) => this.filters.every((f) => f(r)));
    switch (this.mode) {
      case "insert": {
        if (this.db.failInsertTables.has(this.table)) {
          return this.injectedFailure();
        }
        const list = Array.isArray(this.payload)
          ? (this.payload as Row[])
          : [this.payload as Row];
        const inserted = list.map((p) => {
          const row = this.applyDefaults({ ...p });
          rows.push(row);
          return row;
        });
        if (this.wantSingle) return { data: inserted[0], error: null };
        if (this.wantMaybeSingle)
          return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }
      case "upsert": {
        if (this.db.failInsertTables.has(this.table)) {
          return this.injectedFailure();
        }
        const incoming = this.applyDefaults({ ...(this.payload as Row) });
        const idx = rows.findIndex((r) =>
          this.onConflict.every((c) => r[c] === incoming[c])
        );
        let saved: Row;
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...incoming, id: rows[idx].id };
          saved = rows[idx];
        } else {
          rows.push(incoming);
          saved = incoming;
        }
        if (this.wantSingle || this.wantMaybeSingle)
          return { data: saved, error: null };
        return { data: [saved], error: null };
      }
      case "update": {
        const targets = matches();
        for (const row of targets) Object.assign(row, this.payload as Row);
        if (this.wantSingle || this.wantMaybeSingle)
          return { data: targets[0] ?? null, error: null };
        return { data: null, error: null };
      }
      case "delete": {
        const kept = rows.filter((r) => !this.filters.every((f) => f(r)));
        this.db.tables[this.table] = kept;
        return { data: null, error: null };
      }
      default: {
        let out = matches();
        if (this.orderSpec) {
          const { col, ascending } = this.orderSpec;
          out = [...out].sort((a, b) => {
            const av = a[col];
            const bv = b[col];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            const cmp =
              typeof av === "number" && typeof bv === "number"
                ? av - bv
                : String(av) < String(bv)
                  ? -1
                  : 1;
            return cmp * (ascending ? 1 : -1);
          });
        }
        if (this.limitN != null) out = out.slice(0, this.limitN);
        if (this.wantSingle) {
          if (out.length === 0)
            return {
              data: null,
              error: { message: "Row not found", code: "PGRST116" },
            };
          return { data: out[0], error: null };
        }
        if (this.wantMaybeSingle) return { data: out[0] ?? null, error: null };
        return { data: out, error: null };
      }
    }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const result: Promise<QueryResult> = Promise.resolve().then(() =>
      this.execute()
    );
    return result.then(onfulfilled, onrejected);
  }
}

export function createFakeAdmin(
  initial: Record<string, Row[]> = {}
): FakeSupabase {
  const db: FakeSupabase = {
    tables: JSON.parse(JSON.stringify(initial)) as Record<string, Row[]>,
    failInsertTables: new Set<string>(),
    from(table: string) {
      return new Query(db, table);
    },
  };
  return db;
}
