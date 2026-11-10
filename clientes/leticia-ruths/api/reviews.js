// Avaliações reais do Google (Places API New)
// Variáveis na Vercel: GOOGLE_PLACES_KEY (obrigatória) e GOOGLE_PLACE_ID (opcional;
// sem ela, o ID é encontrado pela busca GOOGLE_PLACE_QUERY ou pelo nome padrão abaixo).
// O resultado fica guardado por 12 horas, então o Google é consultado no máximo 2x por dia.
import { send, db, isAdmin } from './_lib.js';

const KEY = process.env.GOOGLE_PLACES_KEY;
const QUERY = process.env.GOOGLE_PLACE_QUERY || 'Leticia Ruths Odontologia, Laranjeiras do Sul - PR';
const TTL = 12 * 3600 * 1000;
const API = 'https://places.googleapis.com/v1/';

async function placeId() {
  if (process.env.GOOGLE_PLACE_ID) return process.env.GOOGLE_PLACE_ID;
  const saved = await db.get('cache', 'google-place').catch(() => null);
  if (saved && saved.placeId && saved.q === QUERY) return saved.placeId;
  const r = await fetch(API + 'places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.id,places.displayName' },
    body: JSON.stringify({ textQuery: QUERY, languageCode: 'pt-BR', regionCode: 'BR' }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Busca do Google falhou');
  const id = j.places && j.places[0] && j.places[0].id;
  if (!id) throw new Error('Clínica não encontrada no Google. Configure GOOGLE_PLACE_ID.');
  await db.set('cache', { id: 'google-place', placeId: id, q: QUERY }).catch(() => {});
  return id;
}

async function fetchGoogle() {
  const id = await placeId();
  const r = await fetch(API + 'places/' + encodeURIComponent(id) + '?languageCode=pt-BR&regionCode=BR', {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri,reviews' },
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Consulta do Google falhou');
  return {
    name: j.displayName && j.displayName.text,
    rating: j.rating || null,
    total: j.userRatingCount || 0,
    url: j.googleMapsUri || '',
    reviews: (j.reviews || []).map((v) => ({
      author: (v.authorAttribution && v.authorAttribution.displayName) || 'Paciente',
      authorUrl: (v.authorAttribution && v.authorAttribution.uri) || '',
      photo: (v.authorAttribution && v.authorAttribution.photoUri) || '',
      rating: v.rating || 5,
      text: (v.text && v.text.text) || (v.originalText && v.originalText.text) || '',
      when: v.relativePublishTimeDescription || '',
      time: v.publishTime || '',
      url: v.googleMapsUri || '',
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido' });
  if (!KEY) return send(res, 503, { configured: false, error: 'GOOGLE_PLACES_KEY não configurada.' });
  let cached = null;
  try { cached = await db.get('cache', 'google-reviews'); } catch {}
  const fresh = cached && Date.now() - cached.t < TTL;
  if (fresh && !(req.query.refresh === '1' && isAdmin(req))) return send(res, 200, { configured: true, ...cached.data, updated: cached.t }, 'public, s-maxage=3600, stale-while-revalidate=86400');
  try {
    const data = await fetchGoogle();
    try { await db.set('cache', { id: 'google-reviews', t: Date.now(), data }); } catch {}
    return send(res, 200, { configured: true, ...data, updated: Date.now() }, 'public, s-maxage=3600, stale-while-revalidate=86400');
  } catch (e) {
    if (cached) return send(res, 200, { configured: true, ...cached.data, updated: cached.t, stale: true }, 'public, s-maxage=600');
    return send(res, 502, { configured: true, error: e.message });
  }
}
