import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { searchZvukofon, streamAudio } from './zvukofon.js';
import { searchJamendo } from './jamendo.js';

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = new URL('./data.json', import.meta.url);
const load = () => {
  let db = {};
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
  return { users: db.users || [], sessions: db.sessions || {}, data: db.data || {} };
};
const save = (db) => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const hash = (pass, salt) => scryptSync(pass, salt, 64).toString('hex');

const source = (process.env.SOURCE || 'zvukofon').toLowerCase();
const fetchTracks = (q) => (source === 'jamendo' ? searchJamendo(q) : searchZvukofon(q));
app.get('/api/stream', streamAudio); // без авторизации: <audio> не умеет слать заголовки

// ---------- Аккаунты ----------
const startSession = (db, user) => {
  const token = randomBytes(32).toString('hex');
  db.sessions[token] = user.id; save(db);
  return { token, username: user.username };
};
app.post('/api/auth/register', (req, res) => {
  const username = String(req.body.username || '').trim(), password = String(req.body.password || '');
  if (!/^[\w.а-яёА-ЯЁ-]{3,20}$/.test(username)) return res.status(400).json({ error: 'Имя: 3–20 символов (буквы, цифры, _ . -)' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль: минимум 6 символов' });
  const db = load();
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'Это имя уже занято' });
  const salt = randomBytes(16).toString('hex');
  const user = { id: randomUUID(), username, salt, hash: hash(password, salt) };
  db.users.push(user);
  res.json(startSession(db, user));
});
app.post('/api/auth/login', (req, res) => {
  const db = load();
  const user = db.users.find(u => u.username.toLowerCase() === String(req.body.username || '').trim().toLowerCase());
  const ok = user && timingSafeEqual(Buffer.from(hash(String(req.body.password || ''), user.salt), 'hex'), Buffer.from(user.hash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'Неверное имя или пароль' });
  res.json(startSession(db, user));
});

const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const db = load(), uid = db.sessions[token];
  if (!uid) return res.status(401).json({ error: 'Нужно войти в аккаунт' });
  req.db = db; req.token = token; req.uid = uid;
  req.u = db.data[uid] ||= { playlists: [], history: [], queries: [] };
  next();
};
app.get('/api/auth/me', auth, (req, res) => res.json({ username: req.db.users.find(u => u.id === req.uid)?.username }));
app.post('/api/auth/logout', auth, (req, res) => { delete req.db.sessions[req.token]; save(req.db); res.json({ ok: true }); });

// ---------- Треки и история поисков ----------
app.get('/api/tracks', auth, async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const tracks = await fetchTracks(q);
    if (q) { req.u.queries = [q, ...req.u.queries.filter(x => x !== q)].slice(0, 10); save(req.db); }
    res.json(tracks);
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/queries', auth, (req, res) => res.json(req.u.queries));
app.delete('/api/queries', auth, (req, res) => { req.u.queries = []; save(req.db); res.json({ ok: true }); });

// ---------- Плейлисты (свои у каждого) ----------
app.get('/api/playlists', auth, (req, res) => res.json(req.u.playlists));
app.post('/api/playlists', auth, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Введите название' });
  const pl = { id: randomUUID(), name, tracks: [] };
  req.u.playlists.push(pl); save(req.db); res.json(pl);
});
app.delete('/api/playlists/:id', auth, (req, res) => {
  req.u.playlists = req.u.playlists.filter(p => p.id !== req.params.id); save(req.db); res.json({ ok: true });
});
app.post('/api/playlists/:id/tracks', auth, (req, res) => {
  const pl = req.u.playlists.find(p => p.id === req.params.id);
  if (!pl) return res.status(404).json({ error: 'Плейлист не найден' });
  const t = req.body.track;
  if (!t?.id) return res.status(400).json({ error: 'Нет трека' });
  if (!pl.tracks.some(x => x.id === t.id)) pl.tracks.push(t);
  save(req.db); res.json(pl);
});
app.delete('/api/playlists/:id/tracks/:tid', auth, (req, res) => {
  const pl = req.u.playlists.find(p => p.id === req.params.id);
  if (!pl) return res.status(404).json({ error: 'Плейлист не найден' });
  pl.tracks = pl.tracks.filter(t => t.id !== req.params.tid); save(req.db); res.json(pl);
});

// ---------- История прослушивания ----------
app.get('/api/history', auth, (req, res) => res.json(req.u.history));
app.post('/api/history', auth, (req, res) => {
  const t = req.body.track; if (!t?.id) return res.status(400).json({ error: 'Нет трека' });
  req.u.history = [{ ...t, playedAt: new Date().toISOString() }, ...req.u.history].slice(0, 200);
  save(req.db); res.json({ ok: true });
});
app.delete('/api/history', auth, (req, res) => { req.u.history = []; save(req.db); res.json({ ok: true }); });

app.listen(process.env.PORT || 4000, () => console.log('API: http://localhost:' + (process.env.PORT || 4000)));
