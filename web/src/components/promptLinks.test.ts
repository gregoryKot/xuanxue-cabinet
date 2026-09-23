import { describe, expect, it } from 'vitest';
import { splitPromptLinks } from './promptLinks';

describe('splitPromptLinks', () => {
  it('текст без ссылок — один кусок текста, как был', () => {
    expect(splitPromptLinks('Повторите форму дыхания')).toEqual([
      { text: 'Повторите форму дыхания' },
    ]);
  });

  it('https-ссылка в середине строки — становится ссылкой', () => {
    expect(splitPromptLinks('Смотрите https://youtu.be/abc и повторите')).toEqual([
      { text: 'Смотрите ' },
      { text: 'https://youtu.be/abc', href: 'https://youtu.be/abc' },
      { text: ' и повторите' },
    ]);
  });

  it('http-ссылка — тоже становится ссылкой', () => {
    expect(splitPromptLinks('http://example.com/video')).toEqual([
      { text: 'http://example.com/video', href: 'http://example.com/video' },
    ]);
  });

  it('javascript: остаётся текстом целиком', () => {
    expect(splitPromptLinks('javascript:alert(1)')).toEqual([
      { text: 'javascript:alert(1)' },
    ]);
  });

  it('data: остаётся текстом целиком', () => {
    const text = 'data:text/html,<script>alert(1)</script>';
    expect(splitPromptLinks(text)).toEqual([{ text }]);
  });

  it('точка в конце предложения не уезжает в ссылку', () => {
    expect(splitPromptLinks('Смотрите https://ya.ru/v.')).toEqual([
      { text: 'Смотрите ' },
      { text: 'https://ya.ru/v', href: 'https://ya.ru/v' },
      { text: '.' },
    ]);
  });

  it('запятая на конце — тоже не часть ссылки', () => {
    expect(splitPromptLinks('Адрес https://ya.ru/v, дальше текст')).toEqual([
      { text: 'Адрес ' },
      { text: 'https://ya.ru/v', href: 'https://ya.ru/v' },
      { text: ', дальше текст' },
    ]);
  });

  it('непарная закрывающая скобка остаётся текстом', () => {
    expect(splitPromptLinks('(смотрите https://ya.ru/v)')).toEqual([
      { text: '(смотрите ' },
      { text: 'https://ya.ru/v', href: 'https://ya.ru/v' },
      { text: ')' },
    ]);
  });

  it('парная скобка внутри адреса остаётся в ссылке', () => {
    const url = 'https://example.com/wiki/Term_(disambiguation)';
    expect(splitPromptLinks(`Статья: ${url} — почитайте`)).toEqual([
      { text: 'Статья: ' },
      { text: url, href: url },
      { text: ' — почитайте' },
    ]);
  });

  it('две ссылки в одной строке — оба куска со своим href', () => {
    expect(splitPromptLinks('https://a.ru и https://b.ru')).toEqual([
      { text: 'https://a.ru', href: 'https://a.ru' },
      { text: ' и ' },
      { text: 'https://b.ru', href: 'https://b.ru' },
    ]);
  });

  it('строка — только адрес, без текста вокруг', () => {
    expect(splitPromptLinks('https://ya.ru')).toEqual([
      { text: 'https://ya.ru', href: 'https://ya.ru' },
    ]);
  });

  // Ошибка валидации «должна начинаться с https://.» — схема стоит словом, и
  // ссылкой она не становится: кликать не на что (ADR-0124, ошибки формы
  // поехали через RichText).
  it('голая схема без хоста остаётся текстом', () => {
    expect(splitPromptLinks('Ссылка должна начинаться с https://.')).toEqual([
      { text: 'Ссылка должна начинаться с https://.' },
    ]);
  });

  it('после голой схемы настоящий адрес всё равно находится', () => {
    const parts = splitPromptLinks('Не http:// а https://ya.ru');
    expect(parts).toEqual([
      { text: 'Не http:// а ' },
      { text: 'https://ya.ru', href: 'https://ya.ru' },
    ]);
  });
});
