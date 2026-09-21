// Разбор ссылки на запись во встраиваемый адрес плеера (PLAN.md §«Запись
// открывается ссылкой наружу»). Чистая функция: ни DOM, ни сети — компонент
// решает, показывать превью с фреймом или так и оставить ссылку. Встраивается
// не всякий хостинг: у ВКонтакте без `oid/id/hash` из кода «Экспортировать» и
// у Яндекс.Диска адрес встраиваемой формы не выводится из обычной ссылки —
// для них `null`, это нормальный ответ, а не ошибка.

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

// Ровно 11 символов — так устроены все действующие id YouTube; короче или
// длиннее — точно не видео, дальше не пытаемся угадать.
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Rutube: 32 шестнадцатеричных символа.
const RUTUBE_ID_RE = /^[0-9a-f]{32}$/i;

/** Секунды из `t=1h2m3s` / `t=90s` / `t=90` / `start=90`. */
function parseTimestampSeconds(raw: string): number | null {
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!match || raw === '') {
    return null;
  }
  const [, h, m, s] = match;
  if (!h && !m && !s) {
    return null;
  }
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

function extractYoutubeId(url: URL): string | null {
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    const id = url.pathname.slice(1);
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'watch') {
    const id = url.searchParams.get('v');
    return id && YOUTUBE_ID_RE.test(id) ? id : null;
  }
  if (
    (segments[0] === 'shorts' || segments[0] === 'live' || segments[0] === 'embed') &&
    segments[1]
  ) {
    return YOUTUBE_ID_RE.test(segments[1]) ? segments[1] : null;
  }
  return null;
}

function buildYoutubeEmbed(url: URL, id: string): string {
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  const raw = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (raw !== null) {
    const seconds = parseTimestampSeconds(raw);
    if (seconds !== null) {
      embed.searchParams.set('start', String(seconds));
    }
  }
  return embed.toString();
}

function extractRutubeId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  // `rutube.ru/video/<id>/` и уже готовый `rutube.ru/play/embed/<id>`.
  if (segments[0] === 'video' && segments[1]) {
    return RUTUBE_ID_RE.test(segments[1]) ? segments[1] : null;
  }
  if (segments[0] === 'play' && segments[1] === 'embed' && segments[2]) {
    return RUTUBE_ID_RE.test(segments[2]) ? segments[2] : null;
  }
  return null;
}

export function videoEmbedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    const id = extractYoutubeId(parsed);
    return id ? buildYoutubeEmbed(parsed, id) : null;
  }

  if (parsed.hostname === 'rutube.ru' || parsed.hostname === 'www.rutube.ru') {
    const id = extractRutubeId(parsed);
    return id ? `https://rutube.ru/play/embed/${id}` : null;
  }

  return null;
}
