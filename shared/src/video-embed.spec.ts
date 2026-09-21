import { describe, expect, it } from 'vitest';
import { videoEmbedUrl } from './video-embed';

const YOUTUBE_ID = 'dQw4w9WgXcQ';
const YOUTUBE_EMBED = `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}`;
const RUTUBE_ID = '1234567890abcdef1234567890abcdef';
const RUTUBE_EMBED = `https://rutube.ru/play/embed/${RUTUBE_ID}`;

describe('videoEmbedUrl', () => {
  it.each([
    ['watch', `https://www.youtube.com/watch?v=${YOUTUBE_ID}`],
    ['youtu.be', `https://youtu.be/${YOUTUBE_ID}`],
    ['shorts', `https://www.youtube.com/shorts/${YOUTUBE_ID}`],
    ['live', `https://www.youtube.com/live/${YOUTUBE_ID}`],
    ['embed', `https://www.youtube.com/embed/${YOUTUBE_ID}`],
  ])('YouTube — форма %s', (_label, url) => {
    expect(videoEmbedUrl(url)).toBe(YOUTUBE_EMBED);
  });

  it.each([
    ['youtube.com', `https://youtube.com/watch?v=${YOUTUBE_ID}`],
    ['m.youtube.com', `https://m.youtube.com/watch?v=${YOUTUBE_ID}`],
    ['youtube-nocookie.com', `https://youtube-nocookie.com/embed/${YOUTUBE_ID}`],
  ])('YouTube — хост %s', (_label, url) => {
    expect(videoEmbedUrl(url)).toBe(YOUTUBE_EMBED);
  });

  it('http понижается до https у встраивания', () => {
    expect(videoEmbedUrl(`http://www.youtube.com/watch?v=${YOUTUBE_ID}`)).toBe(
      YOUTUBE_EMBED,
    );
  });

  it.each([
    ['t=90', '90'],
    ['t=90s', '90'],
    ['t=1m30s', '90'],
    ['t=1h2m3s', '3723'],
    ['start=90', '90'],
  ])('метка времени %s → start=%s', (query, seconds) => {
    expect(videoEmbedUrl(`https://youtu.be/${YOUTUBE_ID}?${query}`)).toBe(
      `${YOUTUBE_EMBED}?start=${seconds}`,
    );
  });

  it('метка времени, которая не разобралась, — без неё, не null', () => {
    expect(videoEmbedUrl(`https://youtu.be/${YOUTUBE_ID}?t=мусор`)).toBe(YOUTUBE_EMBED);
  });

  it.each([10, 12])('YouTube-идентификатор не той длины (%i) → null', (length) => {
    const id = 'a'.repeat(length);
    expect(videoEmbedUrl(`https://youtu.be/${id}`)).toBeNull();
  });

  it('Rutube — /video/<id>/', () => {
    expect(videoEmbedUrl(`https://rutube.ru/video/${RUTUBE_ID}/`)).toBe(RUTUBE_EMBED);
  });

  it('Rutube — уже готовый /play/embed/<id>', () => {
    expect(videoEmbedUrl(RUTUBE_EMBED)).toBe(RUTUBE_EMBED);
  });

  it('Rutube-идентификатор не той длины → null', () => {
    expect(videoEmbedUrl('https://rutube.ru/video/1234/')).toBeNull();
  });

  it('ВКонтакте без oid/id/hash → null', () => {
    expect(videoEmbedUrl('https://vk.com/video-12345_67890')).toBeNull();
  });

  it('Яндекс.Диск → null', () => {
    expect(videoEmbedUrl('https://disk.yandex.ru/i/aBcDeFgHiJkLmN')).toBeNull();
  });

  it.each(['', 'не-ссылка', 'javascript:alert(1)'])(
    'мусор %s → null без исключения',
    (url) => {
      expect(videoEmbedUrl(url)).toBeNull();
    },
  );

  // Хост знакомый, а путь — не видео: лента, канал, корень сайта. Плеера там
  // нет, и гадать нечего.
  it('YouTube с путём, который не видео, — null', () => {
    expect(videoEmbedUrl('https://www.youtube.com/feed/subscriptions')).toBeNull();
    expect(videoEmbedUrl('https://www.youtube.com/')).toBeNull();
  });

  it('Rutube с путём, который не видео, — null', () => {
    expect(videoEmbedUrl('https://rutube.ru/feeds/main/')).toBeNull();
    expect(videoEmbedUrl('https://rutube.ru/')).toBeNull();
  });

  it('пустая метка времени (`t=`) — адрес без start, а не «с начала»', () => {
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  // Метка времени бывает и неполной — только часы или только минуты.
  it('метка только из часов и только из минут', () => {
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=2h')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=7200',
    );
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=5m')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=300',
    );
  });

  // Адрес нужной формы, но без самого идентификатора: обрезали при копировании
  // или человек дал ссылку на раздел. Угадывать нечего.
  it('форма верная, идентификатора нет — null', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch')).toBeNull();
    expect(videoEmbedUrl('https://www.youtube.com/shorts/')).toBeNull();
    expect(videoEmbedUrl('https://rutube.ru/play/embed/')).toBeNull();
    expect(videoEmbedUrl('https://rutube.ru/video/')).toBeNull();
  });
});
