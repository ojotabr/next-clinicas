// Leads que chegam do site (avaliação online, agendamento, concierge)
// POST   /api/leads           → público (site)
// GET    /api/leads           → painel (senha)
// PATCH  /api/leads?id=...    → painel: etapa, agendamento, anotações
// DELETE /api/leads?id=...    → painel
import { send, configError, isAdmin, db, body, clean, newId, ip, decodeData, store } from './_lib.js';

const STAGES = ['novo', 'conversa', 'avaliacao', 'orcamento', 'aprovado', 'perdido'];
const TYPES = ['avaliacao', 'agendamento', 'concierge'];

export default async function handler(req, res) {
  try {
    const cfg = configError(); if (cfg) return send(res, 500, { error: cfg });

    if (req.method === 'POST') {
      if (!(await db.hit('lead:' + ip(req), 12, 600))) return send(res, 429, { error: 'Muitas solicitações. Tente novamente em alguns minutos.' });
      const b = body(req);
      const name = clean(b.name, 80), phone = clean(b.phone, 30).replace(/[^\d+() -]/g, '');
      if (name.length < 2) return send(res, 400, { error: 'Informe seu nome.' });
      if (phone.replace(/\D/g, '').length < 10) return send(res, 400, { error: 'Informe um WhatsApp válido.' });
      if (b.consent !== true) return send(res, 400, { error: 'É preciso autorizar o contato.' });
      let photo = '';
      if (b.photo) { const f = decodeData(b.photo, ['image/'], 3 * 1024 * 1024); if (f) photo = await store('leads', f); }
      const type = TYPES.includes(b.type) ? b.type : 'agendamento';
      const lead = {
        id: newId(), type, name, phone,
        city: clean(b.city, 40), interest: [].concat(b.interest || []).map((x) => clean(x, 60)).filter(Boolean).slice(0, 8),
        since: clean(b.since, 60), when: clean(b.when, 60), pro: clean(b.pro, 60), date: clean(b.date, 10), period: clean(b.period, 20), note: clean(b.note, 400),
        photo, stage: 'novo', appt: null, notes: '', created: Date.now(), seen: false,
        history: [{ t: Date.now(), txt: { avaliacao: 'Pediu avaliação pelo site, com foto', agendamento: 'Pediu agendamento pelo site', concierge: 'Falou com o Instituto pelo site' }[type] }],
      };
      const refCode = clean(b.ref, 40).toLowerCase();
      if (refCode) {
        const ref = await db.get('refs', refCode);
        if (ref && String(ref.phone).replace(/\D/g, '').slice(-10) !== phone.replace(/\D/g, '').slice(-10)) {
          lead.ref = ref.code; lead.refName = ref.name;
          lead.history.push({ t: Date.now(), txt: 'Indicado por ' + ref.name });
        }
      }
      await db.set('leads', lead);
      return send(res, 201, { ok: true, id: lead.id });
    }

    if (!isAdmin(req)) return send(res, 401, { error: 'Senha incorreta.' });

    if (req.method === 'GET') return send(res, 200, { leads: await db.all('leads') });

    const id = clean(req.query.id, 40);
    const lead = id && (await db.get('leads', id));
    if (!lead) return send(res, 404, { error: 'Lead não encontrado.' });

    if (req.method === 'PATCH') {
      const b = body(req);
      if (b.stage && STAGES.includes(b.stage) && b.stage !== lead.stage) {
        lead.stage = b.stage;
        lead.history.push({ t: Date.now(), txt: 'Movido para ' + { novo: 'Novo lead', conversa: 'Em conversa', avaliacao: 'Avaliação agendada', orcamento: 'Orçamento enviado', aprovado: 'Aprovado', perdido: 'Perdido' }[b.stage] });
      }
      if (b.appt && typeof b.appt === 'object') {
        lead.appt = { date: clean(b.appt.date, 10), time: clean(b.appt.time, 5), city: clean(b.appt.city || lead.city, 40), status: b.appt.status === 'cancelado' ? 'cancelado' : 'confirmado' };
        lead.history.push({ t: Date.now(), txt: lead.appt.status === 'cancelado' ? 'Agendamento cancelado' : `Avaliação confirmada para ${lead.appt.date.split('-').reverse().join('/')} às ${lead.appt.time}` });
        if (lead.appt.status === 'confirmado' && ['novo', 'conversa'].includes(lead.stage)) lead.stage = 'avaliacao';
      }
      if (b.notes !== undefined) lead.notes = clean(b.notes, 1000);
      if (b.seen !== undefined) lead.seen = !!b.seen;
      if (b.log) lead.history.push({ t: Date.now(), txt: clean(b.log, 160) });
      lead.history = lead.history.slice(-40);
      await db.set('leads', lead);
      return send(res, 200, { lead });
    }

    if (req.method === 'DELETE') { await db.del('leads', id); return send(res, 200, { ok: true }); }

    return send(res, 405, { error: 'Método não permitido.' });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erro no servidor. Tente novamente.' }); }
}
