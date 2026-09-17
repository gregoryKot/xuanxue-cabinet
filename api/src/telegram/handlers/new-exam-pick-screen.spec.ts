// Чистая логика экрана отметки вопросов — без Mongo и без Telegram
// (CLAUDE.md «Тесты»).
import type { ExamItemDto } from '@xuanxue/shared';
import { clampPage, NO_ITEMS_TEXT, pageCount, pickScreen } from './new-exam-pick-screen';

function fakeItem(id: string, prompt: string): ExamItemDto {
  return {
    id,
    kind: 'text',
    prompt,
    options: [],
    tags: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-09-17T10:00:00Z',
    updatedAt: '2026-09-17T10:00:00Z',
  };
}

const ITEMS = Array.from({ length: 8 }, (_, i) => fakeItem(`item-${i}`, `Вопрос ${i}`));

describe('pageCount/clampPage', () => {
  it('8 вопросов при странице 6 — 2 страницы', () => {
    expect(pageCount(8)).toBe(2);
  });

  it('пустой список — хотя бы одна страница', () => {
    expect(pageCount(0)).toBe(1);
  });

  it('страница за пределами реального числа страниц — зажимается', () => {
    expect(clampPage(5, 8)).toBe(1);
    expect(clampPage(-1, 8)).toBe(0);
  });
});

describe('pickScreen', () => {
  it('нет опубликованных вопросов — текст с действием, только «Отмена»', () => {
    const screen = pickScreen([], [], 0);
    expect(screen.text).toBe(NO_ITEMS_TEXT);
    expect(screen.buttons).toEqual([[{ text: 'Отмена', callback_data: 'nef:cancel' }]]);
  });

  it('первая страница — 6 вопросов, только «Дальше», без «Собрать» (ничего не отмечено)', () => {
    const screen = pickScreen(ITEMS, [], 0);
    const texts = screen.buttons.flat().map((b) => b.text);
    expect(texts).toContain('☐ Вопрос 0');
    expect(texts).toContain('Дальше →');
    expect(texts).not.toContain('← Назад');
    expect(texts.some((t) => t.startsWith('Собрать'))).toBe(false);
  });

  it('вторая страница — «Назад», без «Дальше», хвост списка', () => {
    const screen = pickScreen(ITEMS, [], 1);
    const texts = screen.buttons.flat().map((b) => b.text);
    expect(texts).toContain('☐ Вопрос 6');
    expect(texts).toContain('← Назад');
    expect(texts).not.toContain('Дальше →');
  });

  it('отмеченный вопрос — галочка, «Собрать (k)» появляется', () => {
    const screen = pickScreen(ITEMS, ['item-0', 'item-2'], 0);
    const texts = screen.buttons.flat().map((b) => b.text);
    expect(texts).toContain('☑ Вопрос 0');
    expect(texts).toContain('Собрать (2)');
  });

  it('одна страница целиком — заголовок без «Страница N из M»', () => {
    const screen = pickScreen(ITEMS.slice(0, 3), [], 0);
    expect(screen.text).not.toContain('Страница');
  });
});
