// Envio de vídeos grandes direto do navegador para o Vercel Blob (client upload)
import { handleUpload } from '@vercel/blob/client';
import { isAdmin, body, send } from './_lib.js';
export default async function handler(req, res) {
  try {
    const b = body(req);
    if (b.type === 'blob.generate-client-token' && !isAdmin(req)) return send(res, 401, { error: 'Senha incorreta.' });
    const out = await handleUpload({
      body: b, request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'],
        maximumSizeInBytes: 200 * 1024 * 1024, addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });
    return send(res, 200, out);
  } catch (e) { console.error(e); return send(res, 400, { error: 'Não foi possível enviar o vídeo.' }); }
}
