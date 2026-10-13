// Разбор `returnTo` и страницы входа из wiki (ADR-0183): чистая логика на строках,
// без Nest и без базы. Отказы — по списку контракта web-wiki-session.
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import { parseWikiReturnTo, wikiLoginPath, type WikiEntryPageKey } from './wiki-entry';
import { wikiEntryPageHtml } from './wiki-entry-response';

const WIKI = 'https://wiki.xuanxue.su';

function locationOf(rawQuery: string | undefined): string | undefined {
  const parsed = parseWikiReturnTo(rawQuery, WIKI);
  return parsed.ok ? parsed.location : undefined;
}

describe('parseWikiReturnTo — принимает', () => {
  it('без query и с пустой query — корень wiki', () => {
    for (const query of [undefined, '']) {
      expect(parseWikiReturnTo(query, WIKI)).toEqual({
        ok: true,
        destination: '/',
        location: `${WIKI}/`,
      });
    }
  });

  it('обычный путь', () => {
    expect(parseWikiReturnTo('returnTo=%2Fbook%2Fchapter-1', WIKI)).toEqual({
      ok: true,
      destination: '/book/chapter-1',
      location: `${WIKI}/book/chapter-1`,
    });
  });

  it('путь с query и закодированным фрагментом — всё доезжает до Location', () => {
    expect(parseWikiReturnTo('returnTo=%2Fa%3Fx%3D1%23top', WIKI)).toEqual({
      ok: true,
      destination: '/a?x=1#top',
      location: `${WIKI}/a?x=1#top`,
    });
  });

  it('плюс — пробел, как в форме', () => {
    expect(parseWikiReturnTo('returnTo=/a+b', WIKI)).toMatchObject({
      destination: '/a b',
      location: `${WIKI}/a%20b`,
    });
  });

  it('кириллица в пути уходит в Location процентами — заголовок остаётся ASCII', () => {
    const location = locationOf('returnTo=%2F%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0');
    expect(location).toBe(`${WIKI}/%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0`);
    expect(location).toMatch(/^[\x20-\x7e]+$/);
  });

  it('1024 байта UTF-8 — ровно предел, проходит', () => {
    const path = `/${'a'.repeat(1023)}`;
    expect(locationOf(`returnTo=${encodeURIComponent(path)}`)).toBe(`${WIKI}${path}`);
  });

  it('предел считается в байтах, а не в символах', () => {
    const path = `/${'я'.repeat(512)}`;
    expect(locationOf(`returnTo=${encodeURIComponent(path)}`)).toBeUndefined();
  });

  it('точки в пути не выводят с wiki', () => {
    expect(locationOf('returnTo=%2Fa%2F..%2F..%2F..%2Fb')).toBe(`${WIKI}/b`);
  });
});

describe('parseWikiReturnTo — отказывает', () => {
  const REFUSALS: [string, string][] = [
    ['повтор returnTo', 'returnTo=%2Fa&returnTo=%2Fb'],
    ['чужое поле рядом', 'returnTo=%2Fa&x=1'],
    ['только чужое поле', 'x=1'],
    ['чужое поле раньше', 'x=1&returnTo=%2Fa'],
    ['другой регистр ключа', 'returnto=%2Fa'],
    ['закодированный ключ', 'return%54o=%2Fa'],
    ['часть без «=»', 'returnTo'],
    ['часть без «=» рядом', 'returnTo=%2Fa&flag'],
    ['пустая часть после «&»', 'returnTo=%2Fa&'],
    ['битое процентное кодирование', 'returnTo=%E0%A4%A'],
    ['абсолютный адрес', 'returnTo=https%3A%2F%2Fevil.example'],
    ['адрес без схемы', 'returnTo=%2F%2Fevil.example'],
    ['адрес без схемы, не закодирован', 'returnTo=//evil.example'],
    ['обратный слэш', 'returnTo=/%5Cevil'],
    ['обратный слэш сырым', 'returnTo=/\\evil'],
    ['обратный слэш после слэша', 'returnTo=%2F%5Cevil'],
    ['перевод строки', 'returnTo=%2Fa%0Ab'],
    ['табуляция', 'returnTo=%2Fa%09b'],
    ['нулевой символ', 'returnTo=%2Fa%00'],
    ['DEL', 'returnTo=%2Fa%7F'],
    ['пустое значение', 'returnTo='],
    ['путь без ведущего слэша', 'returnTo=book'],
    ['значение из пробела', 'returnTo=+'],
    ['1025 байт', `returnTo=${encodeURIComponent(`/${'a'.repeat(1024)}`)}`],
  ];

  it.each(REFUSALS)('%s', (_name, query) => {
    expect(parseWikiReturnTo(query, WIKI)).toEqual({ ok: false });
  });
});

describe('wikiLoginPath', () => {
  it('возврат на вход — тот же маршрут с закодированным назначением', () => {
    expect(wikiLoginPath('/a?x=1#top')).toBe(
      `/login?returnTo=${encodeURIComponent(`/wiki?returnTo=${encodeURIComponent('/a?x=1#top')}`)}`,
    );
    expect(wikiLoginPath('/')).toBe('/login?returnTo=%2Fwiki%3FreturnTo%3D%252F');
  });

  it('путь, вернувшийся на вход, снова разбирается в то же назначение', () => {
    const destination = '/страница?q=a b&n=1#часть';
    const login = new URL(wikiLoginPath(destination), 'https://xuanxue.su');
    const back = new URL(login.searchParams.get('returnTo') ?? '', 'https://xuanxue.su');
    const query = back.search.slice(1);
    expect(parseWikiReturnTo(query, WIKI)).toMatchObject({ destination });
  });
});

describe('wikiEntryPageHtml', () => {
  const TEXTS: [WikiEntryPageKey, string, string][] = [
    [
      'invalid',
      'Ссылка на wiki не сработала',
      'Вернитесь в wiki и нажмите «Войти» ещё раз.',
    ],
    ['blocked', 'Доступа нет', ACCESS_MESSAGE],
    [
      'unavailable',
      'Не получилось проверить вход',
      'Подождите минуту и обновите страницу.',
    ],
  ];

  it.each(TEXTS)('%s — заголовок, действие и никаких скриптов', (page, title, action) => {
    const html = wikiEntryPageHtml(page);
    expect(html).toContain('<html lang="ru">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain(`<p>${action}</p>`);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style');
  });
});
