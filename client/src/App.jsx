import { useEffect, useRef, useState } from 'react';
import { sfx } from './sounds.js';

async function api(path, method = 'GET', body) {
  const token = localStorage.getItem('token');
  const headers = { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) };
  const r = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (r.status === 401 && token) { localStorage.removeItem('token'); location.reload(); }
  if (!r.ok) throw new Error(j.error || 'Ошибка запроса');
  return j;
}
const fmt = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function TrackList({ tracks, current, onPlay, playlists, onAdd, onRemove, empty }) {
  if (!tracks.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="tracks">
      {tracks.map((t, i) => (
        <li key={t.id + i} className={current?.id === t.id ? 'active' : ''}>
          <button className="row" onClick={() => onPlay(tracks, i)}>
            <img src={t.cover} alt="" />
            <span className="meta"><b>{t.title}</b><small>{t.artist}</small></span>
            <span className="dur">{fmt(t.duration)}</span>
          </button>
          {onAdd && (
            <select value="" onChange={e => e.target.value && onAdd(e.target.value, t)} aria-label="Добавить в плейлист">
              <option value="">+ В плейлист</option>
              {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {onRemove && <button className="ghost" onClick={() => onRemove(t)}>Убрать</button>}
        </li>
      ))}
    </ul>
  );
}

function Player({ user, onLogout }) {
  const audio = useRef(new Audio());
  const [view, setView] = useState('home');
  const [q, setQ] = useState('');
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [history, setHistory] = useState([]);
  const [openPl, setOpenPl] = useState(null);
  const [newName, setNewName] = useState('');
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.8);
  const [msg, setMsg] = useState('');
  const [queries, setQueries] = useState([]);
  const [snd, setSnd] = useState(sfx.on);
  const current = queue[idx];
  const total = current?.duration || dur;

  const loadTracks = async (query = '') => {
    setMsg('Загружаю…');
    try { setTracks(await api('/tracks?q=' + encodeURIComponent(query))); setMsg(''); }
    catch (e) { setTracks([]); setMsg(e.message); }
  };
  const loadPl = () => api('/playlists').then(setPlaylists).catch(() => {});
  const loadHist = () => api('/history').then(setHistory).catch(() => {});
  const loadQ = () => api('/queries').then(setQueries).catch(() => {});
  const clearQ = async () => { await api('/queries', 'DELETE'); sfx.remove(); loadQ(); };

  useEffect(() => { loadTracks(); loadPl(); loadHist(); loadQ(); }, []);

  const playAt = (list, i) => {
    const t = list[i]; if (!t) return;
    setQueue(list); setIdx(i);
    audio.current.src = t.url; audio.current.play();
    api('/history', 'POST', { track: t }).then(loadHist).catch(() => {});
  };
  const next = (d = 1) => queue.length && playAt(queue, (idx + d + queue.length) % queue.length);
  const nextRef = useRef(); nextRef.current = next;

  useEffect(() => {
    const a = audio.current;
    const on = { play: () => setPlaying(true), pause: () => setPlaying(false),
      timeupdate: () => setPos(a.currentTime),
      loadedmetadata: () => setDur(a.duration || 0),
      error: () => setMsg('Не удалось воспроизвести трек'), ended: () => nextRef.current(1) };
    Object.entries(on).forEach(([k, f]) => a.addEventListener(k, f));
    return () => { a.pause(); Object.entries(on).forEach(([k, f]) => a.removeEventListener(k, f)); };
  }, []);
  useEffect(() => { audio.current.volume = vol; }, [vol]);

  const toggle = () => {
    const a = audio.current;
    if (a.paused) { a.play(); sfx.play(); } else { a.pause(); sfx.pause(); }
  };
  const runQ = (s) => { setQ(s); setView('home'); loadTracks(s).then(loadQ); };
  const search = (e) => { e.preventDefault(); runQ(q.trim()); };
  const addTo = async (plId, t) => { await api(`/playlists/${plId}/tracks`, 'POST', { track: t }); sfx.success(); loadPl(); };
  const createPl = async (e) => {
    e.preventDefault(); if (!newName.trim()) return;
    await api('/playlists', 'POST', { name: newName }); setNewName(''); sfx.success(); loadPl();
  };
  const delPl = async (id) => { await api('/playlists/' + id, 'DELETE'); sfx.remove(); setOpenPl(null); loadPl(); };
  const rmFrom = async (plId, t) => { await api(`/playlists/${plId}/tracks/${t.id}`, 'DELETE'); sfx.remove(); loadPl(); };
  const clearHist = async () => { await api('/history', 'DELETE'); sfx.remove(); loadHist(); };

  const pl = playlists.find(p => p.id === openPl);
  const nav = [['home', 'Музыка'], ['playlists', 'Плейлисты'], ['history', 'История']];

  return (
    <div className="app">
      <aside>
        <h1><span className="g">Riky</span>Wave</h1>
        <nav>{nav.map(([k, n]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => { setView(k); setOpenPl(null); }}>{n}</button>)}</nav>
        <div className="userbox"><span>{user}</span><button className="ghost" onClick={() => setSnd(sfx.toggle())}>Звук: {snd ? 'вкл' : 'выкл'}</button><button className="ghost" onClick={onLogout}>Выйти</button></div>
      </aside>

      <main>
        <form className="search" onSubmit={search}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Трек, исполнитель или жанр" />
          <button>Найти</button>
        </form>
        {queries.length > 0 && <div className="chips">{queries.map(s => <button key={s} className="chip" onClick={() => runQ(s)}>{s}</button>)}<button className="chip x" onClick={clearQ}>очистить</button></div>}

        {view === 'home' && <>
          <h2>{q.trim() ? 'Результаты поиска' : 'Популярное на этой неделе'}</h2>
          {msg && <p className="empty">{msg}</p>}
          <TrackList tracks={tracks} current={current} onPlay={playAt} playlists={playlists} onAdd={addTo} empty={msg ? '' : 'Ничего не найдено. Попробуйте другой запрос.'} />
        </>}

        {view === 'playlists' && !pl && <>
          <h2>Плейлисты</h2>
          <form className="inline" onSubmit={createPl}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название нового плейлиста" />
            <button>Создать</button>
          </form>
          {!playlists.length && <p className="empty">Плейлистов пока нет. Создайте первый и добавляйте в него треки кнопкой «+ В плейлист».</p>}
          <ul className="pls">{playlists.map(p => <li key={p.id}><button onClick={() => setOpenPl(p.id)}><b>{p.name}</b><small>{p.tracks.length} тр.</small></button></li>)}</ul>
        </>}

        {view === 'playlists' && pl && <>
          <button className="ghost" onClick={() => setOpenPl(null)}>← Все плейлисты</button>
          <h2>{pl.name}</h2>
          <div className="actions">
            <button onClick={() => playAt(pl.tracks, 0)} disabled={!pl.tracks.length}>Слушать</button>
            <button className="ghost" onClick={() => delPl(pl.id)}>Удалить плейлист</button>
          </div>
          <TrackList tracks={pl.tracks} current={current} onPlay={playAt} onRemove={t => rmFrom(pl.id, t)} empty="Плейлист пуст. Найдите треки в разделе «Музыка» и добавьте сюда." />
        </>}

        {view === 'history' && <>
          <h2>История прослушивания</h2>
          {history.length > 0 && <div className="actions"><button className="ghost" onClick={clearHist}>Очистить историю</button></div>}
          <TrackList tracks={history} current={current} onPlay={playAt} playlists={playlists} onAdd={addTo} empty="Вы пока ничего не слушали." />
        </>}
      </main>

      <footer className="player">
        {current ? <>
          <div className="now"><img src={current.cover} alt="" /><span className="meta"><b>{current.title}</b><small>{current.artist}</small></span></div>
          <div className="ctrl">
            <div className="btns">
              <button className="ghost" onClick={() => next(-1)} aria-label="Предыдущий">⏮</button>
              <button className="play" onClick={toggle} aria-label={playing ? 'Пауза' : 'Играть'}>{playing ? '❚❚' : '▶'}</button>
              <button className="ghost" onClick={() => next(1)} aria-label="Следующий">⏭</button>
            </div>
            <div className="seek"><small>{fmt(pos)}</small>
              <input type="range" min="0" max={total} value={pos} onChange={e => { audio.current.currentTime = +e.target.value; }} />
              <small>{fmt(total)}</small></div>
          </div>
          <label className="vol">Громкость<input type="range" min="0" max="1" step="0.01" value={vol} onChange={e => setVol(+e.target.value)} /></label>
        </> : <p className="empty">Выберите трек, чтобы начать</p>}
      </footer>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const d = await api('/auth/' + mode, 'POST', { username: name, password: pass });
      localStorage.setItem('token', d.token); sfx.login(); onAuth(d.username);
    } catch (x) { setErr(x.message); sfx.error(); }
  };
  return (
    <div className="auth">
      <form className="glass authbox" onSubmit={submit}>
        <h1><span className="g">Riky</span>Wave</h1>
        <p>{mode === 'login' ? 'Войдите, чтобы слушать свою музыку' : 'Создайте аккаунт — это быстро'}</p>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Имя пользователя" autoComplete="username" />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Пароль (от 6 символов)" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {err && <div className="err">{err}</div>}
        <button>{mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        <button type="button" className="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
          {mode === 'login' ? 'Нет аккаунта? Регистрация' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    const h = (e) => { if (e.target.closest('button:not(.play)')) sfx.click(); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);
  useEffect(() => {
    if (!localStorage.getItem('token')) return setUser(null);
    api('/auth/me').then(d => setUser(d.username)).catch(() => setUser(null));
  }, []);
  const logout = async () => { try { await api('/auth/logout', 'POST'); } catch {} localStorage.removeItem('token'); setUser(null); };
  if (user === undefined) return null;
  return user ? <Player key={user} user={user} onLogout={logout} /> : <AuthScreen onAuth={setUser} />;
}
