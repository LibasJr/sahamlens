let fs: any;
let path: any;
let DB_PATH = '';

const isVercel = !!process.env.VERCEL;
// Fallback in-memory kalau di Vercel (filesystem read-only) - sama pola dengan lib/dbLocal.ts.
// Diseed dari local_db.json yang ikut ter-deploy, lalu update berikutnya cuma nyimpen di memory
// (hilang tiap cold start, tapi minimal gak EROFS crash di tengah request).
let memoryDB: any = null;

if (typeof window === 'undefined') {
  // Use eval to hide require from Webpack static analyzer
  fs = eval('require("fs")');
  path = eval('require("path")');
  DB_PATH = path.join(process.cwd(), 'local_db.json');
}

function readDB() {
  if (typeof window !== 'undefined') return { users: [], watchlists: [], usage_logs: [], alerts: [], payments: [] };
  if (isVercel && memoryDB) return memoryDB;
  if (!fs.existsSync(DB_PATH)) {
    const empty = { users: [], watchlists: [], usage_logs: [], alerts: [], payments: [] };
    if (isVercel) {
      memoryDB = empty;
      return empty;
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(empty));
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (isVercel) memoryDB = data;
    return data;
  } catch (e) {
    return { users: [], watchlists: [], usage_logs: [], alerts: [], payments: [] };
  }
}

function writeDB(data: any) {
  if (typeof window !== 'undefined') return;
  if (isVercel) {
    memoryDB = data;
    return;
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

class QueryBuilder implements PromiseLike<any> {
  table: string;
  queryType: string;
  dataParam: any;
  eqFilters: any[] = [];
  gteFilters: any[] = [];
  matchFilters: any = {};
  opts: any = {};
  chainSelect: boolean = false;

  constructor(table: string) {
    this.table = table;
    this.queryType = 'select';
  }

  select(cols?: string, opts?: any) {
    if (this.queryType !== 'select') {
       this.chainSelect = true;
       return this;
    }
    this.opts = opts || {};
    return this;
  }

  eq(key: string, val: any) {
    this.eqFilters.push({ key, val });
    return this;
  }

  gte(key: string, val: any) {
    this.gteFilters.push({ key, val });
    return this;
  }
  
  match(query: any) {
    this.matchFilters = query;
    return this;
  }

  order(key: string, opts: any) {
    this.opts.order = { key, ...opts };
    return this;
  }

  single() {
    this.opts.single = true;
    return this;
  }

  insert(data: any) {
    this.queryType = 'insert';
    this.dataParam = data;
    return this;
  }

  update(data: any) {
    this.queryType = 'update';
    this.dataParam = data;
    return this;
  }

  upsert(data: any, opts?: any) {
    this.queryType = 'upsert';
    this.dataParam = data;
    this.opts = opts || {};
    return this;
  }

  delete() {
    this.queryType = 'delete';
    return this;
  }

  execute() {
    let db = readDB();
    if (!db[this.table]) db[this.table] = [];
    
    if (this.queryType === 'select') {
      let result = [...db[this.table]];
      for (const f of this.eqFilters) result = result.filter((item: any) => item[f.key] == f.val);
      for (const f of this.gteFilters) result = result.filter((item: any) => item[f.key] >= f.val);
      
      let count = this.opts.count ? result.length : null;
      
      if (this.opts.order) {
        const { key, ascending } = this.opts.order;
        result.sort((a: any, b: any) => ascending ? (a[key] > b[key] ? 1 : -1) : (a[key] < b[key] ? 1 : -1));
      }
      if (this.opts.single) {
        return { data: result[0] || null, error: null, count };
      }
      return { data: result, error: null, count };
    }
    
    if (this.queryType === 'insert') {
      const item = { ...this.dataParam, id: Math.random().toString(), created_at: new Date().toISOString() };
      db[this.table].push(item);
      writeDB(db);
      return { data: [item], error: null };
    }
    
    if (this.queryType === 'update') {
      let count = 0;
      db[this.table] = db[this.table].map((item: any) => {
         let match = true;
         for (const f of this.eqFilters) if (item[f.key] != f.val) match = false;
         if (match) {
             count++;
             return { ...item, ...this.dataParam };
         }
         return item;
      });
      writeDB(db);
      return { data: null, error: null, count };
    }
    
    if (this.queryType === 'upsert') {
      const onConflict = this.opts.onConflict || 'id';
      const keys = onConflict.split(',');
      const existingIdx = db[this.table].findIndex((item: any) => keys.every((k: string) => item[k] == this.dataParam[k]));
      
      let item = { ...this.dataParam };
      if (existingIdx >= 0) {
        db[this.table][existingIdx] = { ...db[this.table][existingIdx], ...this.dataParam };
        item = db[this.table][existingIdx];
      } else {
        item.id = Math.random().toString();
        item.created_at = new Date().toISOString();
        db[this.table].push(item);
      }
      writeDB(db);
      return { data: [item], error: null };
    }
    
    if (this.queryType === 'delete') {
      db[this.table] = db[this.table].filter((item: any) => {
         return !Object.keys(this.matchFilters).every(k => item[k] == this.matchFilters[k]);
      });
      writeDB(db);
      return { data: null, error: null };
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export const supabaseAdmin = {
  from: (table: string) => new QueryBuilder(table)
};

export const supabase = supabaseAdmin;
