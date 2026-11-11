// Casos de antes & depois
// GET /api/cases (site, só publicados) · GET ?admin=1 · POST · PATCH ?id · DELETE ?id (painel)
import { del } from '@vercel/blob';
import { send, configError, isAdmin, db, body, clean, newId, decodeData, store } from './_lib.js';
const blobUrl = (u) => (typeof u === 'string' && /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(u) && u.length < 400 ? u : null);
const RATIOS = ['4/5', '1/1', '4/3'];
function cleanPos(p) {
  const n = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
  const one = (q) => ({ z: n(q && q.z, 1, 3, 1), x: n(q && q.x, -1, 1, 0), y: n(q && q.y, -1, 1, 0) });
  return p && typeof p === 'object' ? { before: one(p.before), after: one(p.after) } : null;
}

export default async function handler(req, res) {
  try {
    const cfg = configError(); if (cfg) return send(res, 500, { error: cfg });
    if (req.method === 'GET' && !req.query.admin) {
      const pub = (await db.all('cases')).filter((c) => c.published && c.consent).map(({ id, title, desc, before, after, ratio }) => ({ id, title, desc, before, after, ratio: ratio || '4/5', published: true }));
      return send(res, 200, { cases: pub }, 'public, s-maxage=30, stale-while-revalidate=300');
    }
    if (!isAdmin(req)) return send(res, 401, { error: 'Senha incorreta.' });
    if (req.method === 'GET') return send(res, 200, { cases: await db.all('cases') });
    const b = body(req);
    if (req.method === 'POST') {
      const title = clean(b.title, 60);
      if (!title) return send(res, 400, { error: 'Informe o tratamento.' });
      if (b.consent !== true) return send(res, 400, { error: 'Confirme o termo de autorização do paciente.' });
      const fb = decodeData(b.before, ['image/'], 3 * 1024 * 1024), fa = decodeData(b.after, ['image/'], 3 * 1024 * 1024);
      if (!fb || !fa) return send(res, 400, { error: 'Fotos inválidas ou grandes demais.' });
      const [before, after] = await Promise.all([store('casos', fb), store('casos', fa)]);
      const c = { id: newId(), title, desc: clean(b.desc, 160), before, after, ob: blobUrl(b.ob), oa: blobUrl(b.oa), pos: cleanPos(b.pos), ratio: RATIOS.includes(b.ratio) ? b.ratio : '4/5', published: b.published !== false, consent: true, created: Date.now() };
      await db.set('cases', c);
      return send(res, 201, { case: c });
    }
    const id = clean(req.query.id, 40); const c = id && (await db.get('cases', id));
    if (!c) return send(res, 404, { error: 'Caso não encontrado.' });
    if (req.method === 'PATCH') {
      if (typeof b.published === 'boolean') c.published = b.published;
      if (b.title !== undefined) c.title = clean(b.title, 60) || c.title;
      if (b.desc !== undefined) c.desc = clean(b.desc, 160);
      if (RATIOS.includes(b.ratio)) c.ratio = b.ratio;
      if (b.pos !== undefined) c.pos = cleanPos(b.pos);
      if (b.ob !== undefined) c.ob = blobUrl(b.ob) || c.ob || null;
      if (b.oa !== undefined) c.oa = blobUrl(b.oa) || c.oa || null;
      // novas fotos recortadas (edição do enquadramento)
      const old = [];
      for (const k of ['before', 'after']) {
        if (b[k] === undefined) continue;
        const f = decodeData(b[k], ['image/'], 3 * 1024 * 1024);
        if (!f) return send(res, 400, { error: 'Fotos inválidas ou grandes demais.' });
        old.push(c[k]); c[k] = await store('casos', f);
      }
      await db.set('cases', c);
      // apaga os recortes antigos que não são usados como foto original
      const keep = new Set([c.before, c.after, c.ob, c.oa]);
      const gone = old.filter((u) => u && !keep.has(u));
      if (gone.length) { try { await del(gone); } catch {} }
      return send(res, 200, { case: c });
    }
    if (req.method === 'DELETE') { await db.del('cases', id); try { await del([c.before, c.after, c.ob, c.oa].filter(Boolean)); } catch {} return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'Método não permitido.' });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erro no servidor. Tente novamente.' }); }
}
