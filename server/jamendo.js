// Запасной источник: Jamendo (нужен JAMENDO_CLIENT_ID). Включается через SOURCE=jamendo.
export async function searchJamendo(q) {
  const id = process.env.JAMENDO_CLIENT_ID;
  if (!id) throw new Error('Не задан JAMENDO_CLIENT_ID в server/.env');
  const p = new URLSearchParams({ client_id: id, format: 'json', limit: '30', audioformat: 'mp32', imagesize: '200' });
  if (q) p.set('search', q); else p.set('order', 'popularity_week');
  const j = await (await fetch('https://api.jamendo.com/v3.0/tracks/?' + p)).json();
  if (j.headers?.status !== 'success') throw new Error(j.headers?.error_message || 'Ошибка Jamendo');
  return j.results.filter(t => t.audio).map(t => ({
    id: String(t.id), title: t.name, artist: t.artist_name,
    cover: t.image || t.album_image, url: t.audio, duration: t.duration,
  }));
}
