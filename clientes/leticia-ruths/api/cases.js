// Casos de antes & depois
// GET /api/cases (site, só publicados) · GET ?admin=1 · POST · PATCH ?id · DELETE ?id (painel)
import { del } from '@vercel/blob';
import { send, configError, isAdmin, db, body, clean, newId, decodeData, store } from './_lib.js';

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
      const c = { id: newId(), title, desc: clean(b.desc, 160), before, after, ratio: ['4/5', '1/1', '4/3'].includes(b.ratio) ? b.ratio : '4/5', published: b.published !== false, consent: true, created: Date.now() };
      await db.set('cases', c);
      return send(res, 201, { case: c });
    }
    const id = clean(req.query.id, 40); const c = id && (await db.get('cases', id));
    if (!c) return send(res, 404, { error: 'Caso não encontrado.' });
    if (req.method === 'PATCH') {
      if (typeof b.published === 'boolean') c.published = b.published;
      if (b.title !== undefined) c.title = clean(b.title, 60) || c.title;
      if (b.desc !== undefined) c.desc = clean(b.desc, 160);
      await db.set('cases', c); return send(res, 200, { case: c });
    }
    if (req.method === 'DELETE') { await db.del('cases', id); try { await del([c.before, c.after]); } catch {} return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'Método não permitido.' });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erro no servidor. Tente novamente.' }); }
}
