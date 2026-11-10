// Orçamentos digitais
// Painel (senha):  GET /api/budgets · POST /api/budgets · PATCH/DELETE /api/budgets?id=...
// Paciente:        GET /api/budgets?id=...&t=TOKEN · POST /api/budgets?id=...&t=TOKEN&action=approve
import { send, configError, isAdmin, db, body, clean, newId, newToken, ip } from './_lib.js';
import crypto from 'node:crypto';

const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function publicView(b) {
  return {
    id: b.id, patient: b.patientName.split(' ')[0], treatment: b.treatment, message: b.message, video: b.video,
    options: b.options, recommended: b.recommended, maxInstallments: b.maxInstallments, pixDiscount: b.pixDiscount,
    validUntil: b.validUntil, status: b.status, choice: b.choice || null, city: b.city || '', updated: b.updated || 0,
  };
}

function parseOptions(list) {
  return [].concat(list || []).slice(0, 3).map((o) => ({ name: clean(o.name, 40), desc: clean(o.desc, 160), price: Math.max(0, Math.round(Number(o.price) || 0)) })).filter((o) => o.name && o.price > 0);
}

export default async function handler(req, res) {
  try {
    const cfg = configError(); if (cfg) return send(res, 500, { error: cfg });
    const id = clean(req.query.id, 40), t = String(req.query.t || '');

    // ---- Paciente ----
    if (id && t) {
      const b = await db.get('budgets', id);
      if (!b || !sameToken(b.token, t)) return send(res, 404, { error: 'Orçamento não encontrado.' });
      const expired = b.status !== 'aprovado' && Date.now() > b.validUntil;
      if (req.method === 'GET') {
        if (!req.query.preview) {
          b.views = (b.views || 0) + 1; b.lastView = Date.now(); if (!b.firstView) b.firstView = Date.now();
          if (b.status === 'enviado') b.status = 'visualizado';
          await db.set('budgets', b);
        }
        return send(res, 200, { budget: { ...publicView(b), status: expired ? 'expirado' : b.status } });
      }
      if (req.method === 'POST' && req.query.action === 'approve') {
        if (!(await db.hit('approve:' + ip(req), 10, 600))) return send(res, 429, { error: 'Tente novamente em alguns minutos.' });
        if (expired) return send(res, 400, { error: 'Este orçamento expirou. Fale com a clínica.' });
        if (b.status === 'aprovado') return send(res, 200, { budget: publicView(b) });
        const p = body(req); const opt = Number(p.option);
        if (!b.options[opt]) return send(res, 400, { error: 'Escolha uma opção.' });
        const inst = Math.min(Math.max(1, Math.round(Number(p.installments) || 1)), b.maxInstallments);
        const pix = p.method === 'pix';
        const total = pix ? Math.round(b.options[opt].price * (1 - (b.pixDiscount || 0) / 100)) : b.options[opt].price;
        b.status = 'aprovado'; b.approvedAt = Date.now();
        b.choice = { option: opt, name: b.options[opt].name, method: pix ? 'pix' : 'parcelado', installments: pix ? 1 : inst, total };
        await db.set('budgets', b);
        if (b.leadId) {
          const lead = await db.get('leads', b.leadId);
          if (lead) { lead.stage = 'aprovado'; lead.history.push({ t: Date.now(), txt: `Aprovou o orçamento: ${b.choice.name} · R$ ${total.toLocaleString('pt-BR')}` }); await db.set('leads', lead); }
        }
        return send(res, 200, { budget: publicView(b) });
      }
      return send(res, 405, { error: 'Método não permitido.' });
    }

    // ---- Painel ----
    if (!isAdmin(req)) return send(res, 401, { error: 'Senha incorreta.' });

    if (req.method === 'GET') return send(res, 200, { budgets: await db.all('budgets') });

    if (req.method === 'POST') {
      const p = body(req);
      const options = parseOptions(p.options);
      const patientName = clean(p.patientName, 80);
      if (!patientName) return send(res, 400, { error: 'Informe o paciente.' });
      if (!options.length) return send(res, 400, { error: 'Adicione pelo menos uma opção com valor.' });
      const video = /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(p.video || '') || /^http:\/\/localhost/.test(p.video || '') ? String(p.video).slice(0, 500) : '';
      const days = Math.min(Math.max(1, Number(p.validDays) || 15), 90);
      const b = {
        id: newId(), token: newToken(), leadId: clean(p.leadId, 40), patientName, phone: clean(p.phone, 30), city: clean(p.city, 40),
        treatment: clean(p.treatment, 80) || 'Plano de tratamento', message: clean(p.message, 600), video,
        options, recommended: Math.min(Math.max(0, Number(p.recommended) || 0), options.length - 1),
        maxInstallments: Math.min(Math.max(1, Number(p.maxInstallments) || 10), 24), pixDiscount: Math.min(Math.max(0, Number(p.pixDiscount) || 0), 30),
        validUntil: Date.now() + days * 86400000, status: 'enviado', views: 0, created: Date.now(),
      };
      await db.set('budgets', b);
      if (b.leadId) {
        const lead = await db.get('leads', b.leadId);
        if (lead) { if (lead.stage !== 'aprovado') lead.stage = 'orcamento'; lead.history.push({ t: Date.now(), txt: `Orçamento enviado: ${b.treatment}` }); await db.set('leads', lead); }
      }
      return send(res, 201, { budget: b });
    }

    const b = id && (await db.get('budgets', id));
    if (!b) return send(res, 404, { error: 'Orçamento não encontrado.' });
    if (req.method === 'PATCH') {
      const p = body(req);
      if (p.edit) {
        if (b.status === 'aprovado') return send(res, 409, { error: 'Este orçamento já foi aprovado e não pode mais ser editado. Crie um novo.' });
        const options = parseOptions(p.options);
        if (!options.length) return send(res, 400, { error: 'Adicione pelo menos uma opção com valor.' });
        b.options = options;
        b.recommended = Math.min(Math.max(0, Number(p.recommended) || 0), options.length - 1);
        if (p.treatment !== undefined) b.treatment = clean(p.treatment, 80) || b.treatment;
        if (p.message !== undefined) b.message = clean(p.message, 600);
        if (p.video !== undefined) b.video = /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(p.video || '') || /^http:\/\/localhost/.test(p.video || '') ? String(p.video).slice(0, 500) : '';
        if (p.maxInstallments !== undefined) b.maxInstallments = Math.min(Math.max(1, Number(p.maxInstallments) || 10), 24);
        if (p.pixDiscount !== undefined) b.pixDiscount = Math.min(Math.max(0, Number(p.pixDiscount) || 0), 30);
        if (p.validDays) b.validUntil = Date.now() + Math.min(Math.max(1, Number(p.validDays) || 15), 90) * 86400000;
        b.updated = Date.now(); b.edits = (b.edits || 0) + 1;
        if (b.leadId) {
          const lead = await db.get('leads', b.leadId);
          if (lead) { lead.history.push({ t: Date.now(), txt: `Orçamento atualizado: ${b.treatment}` }); lead.history = lead.history.slice(-40); await db.set('leads', lead); }
        }
      }
      if (p.extendDays) b.validUntil = Date.now() + Math.min(90, Number(p.extendDays)) * 86400000;
      if (p.reminded) { b.reminders = (b.reminders || 0) + 1; b.lastReminder = Date.now(); }
      await db.set('budgets', b);
      return send(res, 200, { budget: b });
    }
    if (req.method === 'DELETE') { await db.del('budgets', id); return send(res, 200, { ok: true }); }
    return send(res, 405, { error: 'Método não permitido.' });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erro no servidor. Tente novamente.' }); }
}
