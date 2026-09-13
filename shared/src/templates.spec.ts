import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES } from './default-templates';
import { formatDurationRu } from './format-duration';
import { findUnknownPlaceholders, renderTemplate } from './templates';

describe('renderTemplate — реальные посты (PLAN.md §1)', () => {
  it('анонс с паролем, без группы и темы', () => {
    expect(
      renderTemplate(DEFAULT_TEMPLATES.lesson_link, {
        минут: 10,
        название: 'цигун для глаз',
        ссылка: 'https://us02web.zoom.us/j/1',
        пароль: '11111',
      }),
    ).toBe(
      'Через 10 минут цигун для глаз. Запись будет выложена для всех, кто не может участвовать.\nhttps://us02web.zoom.us/j/1 пароль 11111',
    );
  });

  it('анонс с группой и темой, без пароля', () => {
    expect(
      renderTemplate(DEFAULT_TEMPLATES.lesson_link, {
        группа: 'СРЕДНЯЯ ГРУППА',
        минут: 30,
        название: 'Тайцзицюань онлайн',
        тема: 'пятое занятие цикла «Шаги назад: стопы и позвоночник»',
        ссылка: 'https://us02web.zoom.us/j/2?pwd=x',
      }),
    ).toBe(
      'СРЕДНЯЯ ГРУППА\nЧерез 30 минут Тайцзицюань онлайн: пятое занятие цикла «Шаги назад: стопы и позвоночник». Запись будет выложена для всех, кто не может участвовать.\nhttps://us02web.zoom.us/j/2?pwd=x',
    );
  });

  it('запись со всеми полями — без длительности, её убрали из дефолта', () => {
    expect(
      renderTemplate(DEFAULT_TEMPLATES.recording, {
        название: 'Самомассаж (нижняя часть лица, МФР, сидя)',
        длительность: formatDurationRu(30),
        ведущий: 'Мария',
        ссылка: 'https://drive.google.com/file/d/x',
      }),
    ).toBe(
      'Самомассаж (нижняя часть лица, МФР, сидя), ведёт Мария — https://drive.google.com/file/d/x',
    );
  });

  it('запись без темы и ведущего', () => {
    expect(
      renderTemplate(DEFAULT_TEMPLATES.recording, {
        название: 'Самомассаж',
        ссылка: 'https://drive.google.com/file/d/y',
      }),
    ).toBe('Самомассаж — https://drive.google.com/file/d/y');
  });

  it('запись видеофайлом без ссылки — без висячего тире', () => {
    expect(renderTemplate(DEFAULT_TEMPLATES.recording, { название: 'Самомассаж' })).toBe(
      'Самомассаж',
    );
  });
});

describe('renderTemplate — плейсхолдеры и фрагменты', () => {
  it('число подставляется строкой', () => {
    expect(renderTemplate('{минут}', { минут: 5 })).toBe('5');
  });

  it('пробельная строка — пустое значение', () => {
    expect(renderTemplate('[{тема}]', { тема: '   ' })).toBe('');
  });

  it('пустое значение вне скобок — пустая строка, соседний текст на месте', () => {
    expect(renderTemplate('{название}: {тема}', { название: 'A', тема: null })).toBe(
      'A: ',
    );
  });

  it('значение с `$&` и `$1` вставляется буквально', () => {
    // replace с функцией не раскрывает $-паттерны; строковая замена раскрыла бы,
    // и пароль с `$` тихо испортился бы — тест держит это поведение.
    expect(renderTemplate('{пароль}', { пароль: '$&$1' })).toBe('$&$1');
  });

  it('неизвестный плейсхолдер вне скобок остаётся как есть', () => {
    expect(renderTemplate('{дата} — {название}', { название: 'A' })).toBe('{дата} — A');
  });

  it('фрагмент без плейсхолдеров удаляется целиком (простое правило)', () => {
    expect(renderTemplate('[важно] возьмите коврик', {})).toBe(' возьмите коврик');
  });

  it('фрагмент с одним неизвестным плейсхолдером не пуст — остаётся текстом', () => {
    expect(renderTemplate('[{дата}]', {})).toBe('{дата}');
  });

  it('вложенная скобка — внутренняя `[` обычный символ', () => {
    expect(renderTemplate('[a [b] c]', {})).toBe(' c]');
  });

  it('шаблон без скобок и плейсхолдеров возвращается как есть', () => {
    expect(renderTemplate('просто текст', {})).toBe('просто текст');
  });

  it('значение со скобками и фигурными скобками не парсится повторно', () => {
    expect(
      renderTemplate('{название}[: {тема}]', {
        название: 'A [x]',
        тема: '{b} ]',
      }),
    ).toBe('A [x]: {b} ]');
  });

  it('значение не сканируется на свои же плейсхолдеры', () => {
    expect(renderTemplate('{тема}', { тема: '{пароль}' })).toBe('{пароль}');
  });
});

describe('findUnknownPlaceholders', () => {
  it('находит неизвестные, известные пропускает', () => {
    expect(findUnknownPlaceholders('{дата} и {название}')).toEqual(['дата']);
  });

  it('без дублей, в порядке первого появления', () => {
    expect(findUnknownPlaceholders('{Название} {title} {дата} {дата}')).toEqual([
      'Название',
      'title',
      'дата',
    ]);
  });

  it('пустые и незакрытые фигурные скобки не считаются плейсхолдером', () => {
    expect(findUnknownPlaceholders('{} и {')).toEqual([]);
  });

  it('имя с пробелами — неизвестное: рендер его не подставит', () => {
    expect(findUnknownPlaceholders('{ название } и {тема}')).toEqual([' название ']);
    expect(renderTemplate('{ название }', { название: 'A' })).toBe('{ название }');
  });
});
