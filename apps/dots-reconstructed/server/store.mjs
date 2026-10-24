import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export class Store {
  constructor(dataDir) {
    mkdirSync(dataDir,{recursive:true,mode:0o700});
    this.db=new DatabaseSync(join(dataDir,'dots.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS objects(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS events(revision INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(token TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    this.listeners=new Set();
  }
  all(kind){return this.db.prepare('SELECT value FROM objects WHERE kind=? ORDER BY rowid').all(kind).map(r=>JSON.parse(r.value));}
  get(kind,id){let r=this.db.prepare('SELECT value FROM objects WHERE kind=? AND id=?').get(kind,id);return r&&JSON.parse(r.value);}
  put(kind,obj,eventType=kind+'.updated'){
    this.db.prepare('INSERT INTO objects VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,obj.id,JSON.stringify(obj));
    this.emit(eventType,obj);return obj;
  }
  patch(kind,key,patch){let current=this.get(kind,key);if(!current) return null;return this.put(kind,{...current,...patch});}
  emit(type,data){let at=now();let r=this.db.prepare('INSERT INTO events(type,data,created_at) VALUES(?,?,?)').run(type,JSON.stringify(data),at);let event={revision:Number(r.lastInsertRowid),type,data,created_at:at};if(this.pendingEvents)this.pendingEvents.push(event);else this.publish(event);return event;}
  publish(event){for(let fn of this.listeners){try{fn(event);}catch{this.listeners.delete(fn);}}}
  events(after=0){return this.db.prepare('SELECT * FROM events WHERE revision>? ORDER BY revision').all(after).map(r=>({...r,data:JSON.parse(r.data)}));}
  revision(){return Number(this.db.prepare('SELECT MAX(revision) AS revision FROM events').get().revision||0);}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');this.pendingEvents=[];try{let result=fn();this.db.exec('COMMIT');let events=this.pendingEvents;this.pendingEvents=null;for(let event of events)this.publish(event);return result;}catch(e){this.pendingEvents=null;this.db.exec('ROLLBACK');throw e;}}
  request(token){let r=this.db.prepare('SELECT value FROM requests WHERE token=?').get(token);return r&&JSON.parse(r.value);}
  remember(token,value){this.db.prepare('INSERT INTO requests VALUES(?,?)').run(token,JSON.stringify(value));}
  getSettings(){return this.get('settings','app')||{};}
  close(){this.db.close();}
}
