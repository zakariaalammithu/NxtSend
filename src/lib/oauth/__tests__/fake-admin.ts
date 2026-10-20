/**
 * A minimal in-memory fake of the Supabase service-role client,
 * covering exactly the query-builder surface the OAuth store /
 * mailbox-server resolvers / adapters use (select/insert/update/
 * delete + eq/in/not/order/limit + maybeSingle/single + direct
 * await). Rows live in plain arrays so tests can inspect what was
 * ACTUALLY persisted (e.g. that stored tokens are ciphertext).
 */

export type DbRow = Record<string, unknown>;

export class FakeDb {
  tables = new Map<string, DbRow[]>();
  seq = 0;
  table(name: string): DbRow[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name) as DbRow[];
  }
  seed(name: string, rows: DbRow[]): void {
    this.tables.set(name, rows.map((r) => ({ ...r })));
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private filters: Array<(row: DbRow) => boolean> = [];
  private insertRow: DbRow | null = null;
  private patch: DbRow | null = null;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(): this {
    return this;
  }
  insert(row: DbRow): this {
    this.mode = "insert";
    this.insertRow = row;
    return this;
  }
  update(patch: DbRow): this {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.mode = "delete";
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  not(col: string): this {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined);
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }

  private exec(): { data: unknown; error: unknown } {
    const rows = this.db.table(this.table);
    const matches = (r: DbRow) => this.filters.every((f) => f(r));
    switch (this.mode) {
      case "insert": {
        const now = new Date().toISOString();
        const newRow: DbRow = {
          id: `${this.table}_${++this.db.seq}`,
          created_at: now,
          updated_at: now,
          ...(this.insertRow ?? {}),
        };
        rows.push(newRow);
        return { data: newRow, error: null };
      }
      case "update": {
        for (const r of rows.filter(matches)) Object.assign(r, this.patch);
        return { data: null, error: null };
      }
      case "delete": {
        this.db.tables.set(
          this.table,
          rows.filter((r) => !matches(r))
        );
        return { data: null, error: null };
      }
      default:
        return { data: rows.filter(matches).map((r) => ({ ...r })), error: null };
    }
  }

  maybeSingle(): Promise<{ data: DbRow | null; error: null }> {
    const { data } = this.exec();
    const arr = Array.isArray(data) ? data : [data];
    return Promise.resolve({ data: (arr[0] as DbRow) ?? null, error: null });
  }

  single(): Promise<{ data: DbRow | null; error: { message: string } | null }> {
    const { data } = this.exec();
    const arr = Array.isArray(data) ? data : [data];
    return Promise.resolve(
      arr[0]
        ? { data: arr[0] as DbRow, error: null }
        : { data: null, error: { message: "no rows found" } }
    );
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
}

/** Cast-compatible with the SupabaseClient surface the code uses. */
export class FakeAdmin {
  constructor(public db: FakeDb = new FakeDb()) {}
  from(table: string): FakeQuery {
    return new FakeQuery(this.db, table);
  }
}
