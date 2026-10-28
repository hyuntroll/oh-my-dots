import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
let hashing=0;const waiting=[];
async function derive(...args){if(hashing>=2)await new Promise(done=>waiting.push(done));else hashing++;try{return await scrypt(...args);}finally{const next=waiting.shift();if(next)next();else hashing--;}}
const digest = value => createHash('sha256').update(value).digest('hex');
const publicUser = row => row && ({id:row.id,username:row.username,displayName:row.display_name,admin:Boolean(row.admin)});
const fail = (message,status=400) => Object.assign(Error(message),{status});
export class Accounts {
  constructor(directory) {
    mkdirSync(directory,{recursive:true,mode:0o700});
    const file=join(directory,'accounts.sqlite');this.db=new DatabaseSync(file);chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,display_name TEXT NOT NULL,password TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0,data_path TEXT,created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);`);
  }
  count(){return this.db.prepare('SELECT count(*) AS n FROM users').get().n;}
  list(){return this.db.prepare('SELECT * FROM users ORDER BY created_at').all().map(publicUser);}
  user(id){return publicUser(this.db.prepare('SELECT * FROM users WHERE id=?').get(id));}
  dataPath(id){return this.db.prepare('SELECT data_path FROM users WHERE id=?').get(id)?.data_path;}
  async password(value){
    if(typeof value!=='string'||value.length<12||Buffer.byteLength(value)>1024)throw fail('비밀번호는 12자 이상, 1024바이트 이하로 입력하세요.');
    const salt=randomBytes(16).toString('hex');const key=await derive(value,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});return `scrypt:${salt}:${key.toString('hex')}`;
  }
  async create({username,password,displayName,admin=false,dataPath=null}){
    if(typeof username!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$/.test(username))throw fail('아이디는 영문·숫자·._- 3~64자로 입력하세요.');
    username=username.toLowerCase();if(this.db.prepare('SELECT id FROM users WHERE username=?').get(username))throw fail('이미 사용 중인 아이디입니다.',409);
    const hash=await this.password(password);const id=randomUUID();
    const name=String(displayName||username).trim();if(!name||name.length>100)throw fail('표시 이름은 1~100자여야 합니다.');
    try{this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(id,username,name,hash,admin?1:0,dataPath,Date.now());}catch(error){if(error.code?.includes('CONSTRAINT'))throw fail('이미 사용 중인 아이디입니다.',409);throw error;}
    return this.user(id);
  }
  async verify(username,password){
    const row=this.db.prepare('SELECT * FROM users WHERE username=?').get(String(username||'').toLowerCase());
    const [,salt,expected]=(row?.password||'scrypt:00000000000000000000000000000000:'+ '00'.repeat(64)).split(':');
    const actual=await derive(String(password||'').slice(0,1024),salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
    return row&&timingSafeEqual(actual,Buffer.from(expected,'hex'))?publicUser(row):null;
  }
  session(userId){const token=randomBytes(32).toString('hex'),expires=Date.now()+7*86400000;this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),userId,expires);return {token,expires};}
  resolve(token){if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const row=this.db.prepare('SELECT user_id,expires FROM sessions WHERE hash=? AND expires>?').get(digest(token),Date.now());return row&&{user:this.user(row.user_id),expires:row.expires};}
  logout(token){this.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token||''));}
  async update(id,{displayName,password}){if(displayName!==undefined){if(typeof displayName!=='string'||!displayName.trim()||displayName.length>100)throw fail('이름은 1~100자로 입력하세요.');this.db.prepare('UPDATE users SET display_name=? WHERE id=?').run(displayName.trim(),id);}if(password!==undefined){const hash=await this.password(password);this.db.prepare('UPDATE users SET password=? WHERE id=?').run(hash,id);this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);}return this.user(id);}
  close(){this.db.close();}
}
