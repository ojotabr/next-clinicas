// Utilitários compartilhados da API (arquivos com "_" não viram rotas na Vercel)
import { put } from '@vercel/blob';
import crypto from 'node:crypto';

const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const NS = 'lr:'; // prefixo das chaves no banco

export function send(res, status, data, cache) {
  res.setHeader('Cache-Control', cache || 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(data));
}

export function configError() {
  if (!R_URL || !R_TOK) return 'Banco de dados (Upstash Redis) não conectado ao projeto.';
  if (!process.env.BLOB_READ_WRITE_TOKEN) return 'Armazenamento (Vercel Blob) não conectado ao projeto.';
  if (!process.env.PAINEL_SENHA) return 'Variável PAINEL_SENHA não configurada.';
  return null;
}

const SECRET = () => crypto.createHash('sha256').update('lr-sess:' + (process.env.PAINEL_SENHA || '')).digest();
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function signToken(u, days = 30) {
  const exp = Date.now() + days * 864e5, base = `${u.id}.${exp}.${u.ver || 0}`;
  return 'u.' + base + '.' + b64u(crypto.createHmac('sha256', SECRET()).update(base).digest());
}
export const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(String(pw), salt, 32).toString('hex') });
export const checkPw = (pw, u) => { if (!u || !u.salt || !u.hash) return false; const h = Buffer.from(hashPw(pw, u.salt).hash, 'hex'), o = Buffer.from(u.hash, 'hex'); return h.length === o.length && crypto.timingSafeEqual(h, o); };
export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, active: u.active !== false, mustChange: !!u.mustChange, created: u.created, lastLogin: u.lastLogin || null });

// Quem está chamando a API: senha principal (PAINEL_SENHA) ou sessão de um usuário cadastrado.
// Retorna { id, name, role, mustChange } ou null. É assíncrona: use sempre "await isAdmin(req)".
export async function isAdmin(req) {
  const key = process.env.PAINEL_SENHA;
  const got = String(req.headers['x-painel-key'] || '');
  if (!key || !got) return null;
  if (got.length === key.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key))) return { id: 'master', name: 'Administradora', role: 'admin', mustChange: false };
  const m = /^u\.([a-z0-9]+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(got);
  if (!m || +m[2] < Date.now()) return null;
  const sig = b64u(crypto.createHmac('sha256', SECRET()).update(`${m[1]}.${m[2]}.${m[3]}`).digest());
  if (sig.length !== m[4].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(m[4]))) return null;
  try {
    const u = await db.get('users', m[1]);
    if (!u || u.active === false || String(u.ver || 0) !== m[3]) return null;
    return { id: u.id, name: u.name, role: u.role || 'equipe', mustChange: !!u.mustChange, user: u };
  } catch { return null; }
}

async function redis(cmd) {
  const r = await fetch(R_URL, { method: 'POST', headers: { Authorization: `Bearer ${R_TOK}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error('redis: ' + j.error);
  return j.result;
}

export const db = {
  async all(col) {
    const flat = (await redis(['HGETALL', NS + col])) || [];
    const out = [];
    for (let i = 0; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i + 1])); } catch {} }
    return out.sort((a, b) => (b.created || 0) - (a.created || 0));
  },
  async get(col, id) { const v = await redis(['HGET', NS + col, id]); return v ? JSON.parse(v) : null; },
  async set(col, obj) { await redis(['HSET', NS + col, obj.id, JSON.stringify(obj)]); return obj; },
  async del(col, id) { await redis(['HDEL', NS + col, id]); },
  async hit(key, max, windowSec) { // limite simples de requisições
    const k = NS + 'rl:' + key; const n = await redis(['INCR', k]);
    if (n === 1) await redis(['EXPIRE', k, windowSec]);
    return n <= max;
  },
};

export function body(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

export const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
export const newToken = () => crypto.randomBytes(12).toString('hex');
export const ip = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();

export function decodeData(dataUrl, kinds, maxBytes) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (!kinds.some((k) => type.startsWith(k))) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes) return null;
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[type] || 'bin';
  return { buf, type, ext };
}

export async function store(folder, file) {
  const r = await put(`${folder}/${newId()}.${file.ext}`, file.buf, { access: 'public', contentType: file.type, addRandomSuffix: true });
  return r.url;
}
