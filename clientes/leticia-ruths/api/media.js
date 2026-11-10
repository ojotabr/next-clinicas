// Envio de arquivos pequenos pelo painel (até ~3,5 MB): POST { data: "data:...;base64,..." } → { url }
import { send, configError, isAdmin, body, decodeData, store } from './_lib.js';
export default async function handler(req, res) {
  try {
    const cfg = configError(); if (cfg) return send(res, 500, { error: cfg });
    if (!isAdmin(req)) return send(res, 401, { error: 'Senha incorreta.' });
    if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });
    const f = decodeData(body(req).data, ['image/', 'video/'], 3.6 * 1024 * 1024);
    if (!f) return send(res, 400, { error: 'Arquivo inválido ou grande demais.' });
    return send(res, 201, { url: await store(f.type.startsWith('video/') ? 'videos' : 'midia', f) });
  } catch (e) { console.error(e); return send(res, 500, { error: 'Erro no servidor.' }); }
}
