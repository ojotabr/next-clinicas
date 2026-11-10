// Programa de indicação ("Indique um sorriso")
// POST   /api/refs                 → público: gera (ou recupera) o link pessoal de quem indica
// GET    /api/refs?code=...        → público: nome de quem indicou (conta 1 clique por visitante/dia)
// GET    /api/refs?admin=1         → painel (senha): indicadores + resultados
// PATCH  /api/refs?code=...        → painel: marcar benefício entregue, anotações
// DELETE /api/refs?code=...        → painel
import crypto from 'node:crypto';
import { send, configError, isAdmin, db, body, clean, ip } from './_lib.js';

const digits = (s) => String(s || '').replace(/\D/g, '');
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const slug = (s) => first(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'amigo';
const rnd = () => Array.from(crypto.randomBytes(4)).map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

export default async function handler(req, res) {
  try {
    const cfg = configError(); if (cfg) return send(res, 500, { error: cfg });

    if (req.method === 'POST') {
      if (!(await db.hit('ref:' + ip(req), 8, 600))) return send(res, 429, { error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      const b = body(req);
      const name = clean(b.name, 60), phone = clean(b.phone, 30).replace(/[^\d+() -]/g, '');
      if (name.length < 2) return send(res, 400, { error: 'Informe seu nome.' });
      if (digits(phone).length < 10) return send(res, 400, { error: 'Informe um WhatsApp válido.' });
      if (b.consent !== true) return send(res, 400, { error: 'É preciso autorizar o contato.' });
      const all = await db.all('refs');
      const found = all.find((r) => digits(r.phone).slice(-10) === digits(phone).slice(-10));
      if (found) return send(res, 200, { code: found.code, name: first(found.name) });
      let code = slug(name) + '-' + rnd();
      while (all.some((r) => r.code === code)) code = slug(name) + '-' + rnd();
      const ref = { id: code, code, name, phone, clicks: 0, rewarded: false, notes: '', created: Date.now() };
      await db.set('refs', ref);
      return send(res, 201, { code, name: first(name) });
    }

    if (req.method === 'GET' && !req.query.admin) {
      const code = clean(req.query.code, 40).toLowerCase();
      const ref = code && (await db.get('refs', code));
      if (!ref) return send(res, 404, { error: 'Convite não encontrado.' });
      if (!req.query.nc && (await db.hit('click:' + code + ':' + ip(req), 1, 86400))) { ref.clicks = (ref.clicks || 0) + 1; await db.set('refs', ref); }
      return send(res, 200, { code, name: first(ref.name) });
    }

    if (!isAdmin(req)) return send(res, 401, { error: 'Senha incorreta.' });

    if (req.method === 'GET') {
      const [refs, leads] = await Promise.all([db.all('refs'), db.all('leads')]);
      const out = refs.map((r) => {
        const ls = leads.filter((l) => l.ref === r.code);
        return {
          ...r,
          leads: ls.length,
          booked: ls.filter((l) => (l.appt && l.appt.status === 'confirmado') || ['avaliacao', 'orcamento', 'aprovado'].includes(l.stage)).length,
          approved: ls.filter((l) => l.stage === 'aprovado').length,
          referred: ls.map((l) => ({ id: l.id, name: l.name, stage: l.stage, created: l.created })),
        };
      });
      return send(res, 200, { refs: out });
    }

    const code = clean(req.query.code, 40).toLowerCase();
    const ref = code && (await db.get('refs', code));
    if (!ref) return send(res, 404, { error: 'Indicação não encontrada.' });

    if (req.method === 'PATCH') {
      const b = body(req);
      if (b.rewarded !== undefined) ref.rewarded = !!b.rewarded;
      if (b.notes !== undefined) ref.notes = clean(b.notes, 500);
      await db.set('refs', ref);
      return send(res, 200, { ref });
    }
    if (req.method === 'DELETE') { await db.del('refs', code); return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'Método não permitido.' });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erro no servidor. Tente novamente.' }); }
}
