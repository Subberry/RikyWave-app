// Источник треков: new.zvukofon.com. Логика парсера взята из проекта dungmusic (data-musmeta).
import axios from 'axios';
import * as cheerio from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const BASE_URL = 'https://new.zvukofon.com';
// Сайт может блокировать датацентровые IP — тогда укажите PROXY_URL в .env
const agent = process.env.PROXY_URL ? new HttpsProxyAgent(process.env.PROXY_URL) : undefined;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  Referer: BASE_URL + '/',
};

const abs = (u) => !u ? null : u.startsWith('http') ? u : u.startsWith('//') ? 'https:' + u : BASE_URL + (u.startsWith('/') ? u : '/' + u);
const streamUrl = (u) => '/api/stream?u=' + encodeURIComponent(u);
const parseDur = (s = '') => {
  const p = s.trim().split(':').map(n => parseInt(n, 10));
  return p.length === 2 && !p.some(isNaN) ? p[0] * 60 + p[1] : 0;
};

export function parseTracks(html) {
  const $ = cheerio.load(html);
  const tracks = [], seen = new Set();
  $('[data-musmeta]').each((_, el) => {
    const $el = $(el);
    let meta;
    try { meta = JSON.parse($el.attr('data-musmeta')); } catch { return; }
    if (!meta?.title || !meta?.url) return;
    const id = String(meta.id || meta.url);
    if (seen.has(id)) return;
    seen.add(id);
    tracks.push({
      id,
      title: meta.title.trim(),
      artist: (meta.artist || 'Unknown').trim(),
      cover: abs(meta.img),
      url: streamUrl(abs(meta.url)),
      duration: parseDur($el.find('.topcharts__item-info-time_total, .track-duration').first().text()),
    });
  });
  return tracks;
}

export async function searchZvukofon(q) {
  const url = q ? `${BASE_URL}/music/${encodeURIComponent(q.toLowerCase())}` : BASE_URL + '/';
  try {
    const { data } = await axios.get(url, { timeout: 20000, httpsAgent: agent, headers: HEADERS });
    return parseTracks(data);
  } catch (e) {
    const s = e.response?.status;
    if (s === 403 || s === 451 || s === 429 || !s)
      throw new Error('Сайт не ответил или отклонил запрос (' + (s || e.code || 'сеть') + '). Попробуйте VPN или задайте PROXY_URL в server/.env');
    throw new Error('Ошибка источника: ' + s);
  }
}

// Прокси аудио: браузер играет трек через наш сервер (с поддержкой перемотки).
export async function streamAudio(req, res) {
  let u;
  try { u = new URL(req.query.u); } catch { return res.status(400).json({ error: 'Неверный адрес' }); }
  if (u.protocol !== 'https:' || !/(^|\.)zvukofon\.com$/.test(u.hostname))
    return res.status(400).json({ error: 'Недопустимый адрес' });
  try {
    const r = await axios.get(u.href, {
      responseType: 'stream', httpsAgent: agent, timeout: 20000, validateStatus: s => s < 400,
      headers: { ...HEADERS, ...(req.headers.range && { Range: req.headers.range }) },
    });
    res.status(r.status);
    for (const h of ['content-length', 'content-range', 'accept-ranges']) if (r.headers[h]) res.setHeader(h, r.headers[h]);
    const ct = r.headers['content-type'] || '';
    res.setHeader('content-type', ct.startsWith('audio/') ? ct : 'audio/mpeg');
    r.data.pipe(res);
    req.on('close', () => r.data.destroy());
  } catch {
    if (!res.headersSent) res.status(502).json({ error: 'Не удалось получить аудио' });
  }
}
