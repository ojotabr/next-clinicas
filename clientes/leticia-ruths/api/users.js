// Usuários do painel (secretária, equipe)
// POST ?action=login {email,password}            → { token, user }
// POST ?action=password {password}  (logado)      → { token, user }   troca a senha (primeiro acesso)
// GET  ?action=me                   (logado)      → { me }
// GET                               (admin)       → { users }
// POST {name,phone,email,role}      (admin)       → { user, tempPassword }
// PATCH ?id {action:'reset'|'toggle', name,phone,role} (admin)
// DELETE ?id                        (admin)
import crypto from 'node:crypto';
import { send, configError, isAdmin, db, body, clean, newId, ip, signToken, hashPw, checkPw, publicUser } from './_lib.js';

const ROLES = ['admin', 'equipe'];
const okEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
function tempPassword() { // fácil de digitar: sem 0/O, 1/l/I
  const A = 'abcdefghjkmnpqrstuvwxyz', N = '23456789', r = (s) => s[crypto.randomInt(s.length)];
  return 'Lr' + r(N) + r(A) + r(A) + r(N) + r(A) + r(N) + r(A);
}
const meOf = (who) => ({ id: who.id, name: who.name, role: who.role, mustChange: who.mustChange, master: who.id === 'master' });

export default async function handler(req, res) {
  try {
    const cfg = configError(); if (cfg) return send(res, 500, { error: cfg });
    const action = String(req.query.action || '');
    const b = body(req);

    if (req.method === 'POST' && action === 'login') {
      if (!(await db.hit('login:' + ip(req), 12, 600))) return send(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
      const email = clean(b.email, 120).toLowerCase(), pw = String(b.password || '');
      const u = (await db.all('users')).find((x) => x.email === email);
      if (!u || u.active === false || !checkPw(pw, u)) return send(res, 401, { error: 'E-mail ou senha incorretos.' });
      u.lastLogin = Date.now(); await db.set('users', u);
      return send(res, 200, { token: signToken(u), user: publicUser(u) });
    }

    const who = await isAdmin(req);
    if (!who) return send(res, 401, { error: 'Senha incorreta.' });

    if (req.method === 'GET' && action === 'me') return send(res, 200, { me: meOf(who) });

    if (req.method === 'POST' && action === 'password') {
      if (who.id === 'master') return send(res, 400, { error: 'A senha principal é trocada na Vercel (PAINEL_SENHA).' });
      const pw = String(b.password || '');
      if (pw.length < 8) return send(res, 400, { error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
      const u = who.user; if (checkPw(pw, u)) return send(res, 400, { error: 'Escolha uma senha diferente da provisória.' });
      Object.assign(u, hashPw(pw), { mustChange: false, ver: (u.ver || 0) + 1, pwChanged: Date.now() });
      await db.set('users', u);
      return send(res, 200, { token: signToken(u), user: publicUser(u) });
    }

    if (who.role !== 'admin') return send(res, 403, { error: 'Apenas administradores podem gerenciar usuários.' });

    if (req.method === 'GET') return send(res, 200, { users: (await db.all('users')).map(publicUser) });

    if (req.method === 'POST') {
      const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase(), phone = clean(b.phone, 30);
      if (name.length < 2) return send(res, 400, { error: 'Informe o nome.' });
      if (!okEmail(email)) return send(res, 400, { error: 'Informe um e-mail válido.' });
      const all = await db.all('users');
      if (all.some((x) => x.email === email)) return send(res, 409, { error: 'Já existe um usuário com este e-mail.' });
      const tmp = tempPassword();
      const u = { id: newId(), name, email, phone, role: ROLES.includes(b.role) ? b.role : 'equipe', active: true, mustChange: true, ver: 0, created: Date.now(), createdBy: who.name, ...hashPw(tmp) };
      await db.set('users', u);
      return send(res, 201, { user: publicUser(u), tempPassword: tmp });
    }

    const id = clean(req.query.id, 40); const u = id && (await db.get('users', id));
    if (!u) return send(res, 404, { error: 'Usuário não encontrado.' });

    if (req.method === 'PATCH') {
      let tmp = null;
      if (b.action === 'reset') { tmp = tempPassword(); Object.assign(u, hashPw(tmp), { mustChange: true, ver: (u.ver || 0) + 1 }); }
      if (b.action === 'toggle') { u.active = u.active === false; u.ver = (u.ver || 0) + 1; }
      if (b.name !== undefined) u.name = clean(b.name, 80) || u.name;
      if (b.phone !== undefined) u.phone = clean(b.phone, 30);
      if (ROLES.includes(b.role)) u.role = b.role;
      await db.set('users', u);
      return send(res, 200, { user: publicUser(u), tempPassword: tmp });
    }
    if (req.method === 'DELETE') {
      if (who.id === u.id) return send(res, 400, { error: 'Você não pode excluir o próprio usuário.' });
      await db.del('users', id); return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Método não permitido.' });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erro no servidor. Tente novamente.' }); }
}
