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

export function isAdmin(req) {
  const key = process.env.PAINEL_SENHA;
  const got = String(req.headers['x-painel-key'] || '');
  if (!key || got.length !== key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key));
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
