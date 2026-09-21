// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type { LinkAttachedContext } from '../media/exam-media-notifier.port';
import { linkAttachedMessage } from './link-attached-message';

const CONTEXT: LinkAttachedContext = {
  attemptId: '507f1f77bcf86cd799439011',
  userId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
  url: 'https://vk.com/video-1',
};

describe('linkAttachedMessage', () => {
  it('имя, экзамен и ссылка — на месте, ссылка идёт голым текстом', () => {
    const text = linkAttachedMessage('Мария', CONTEXT);

    expect(text).toContain('Мария');
    expect(text).toContain('«Экзамен по третьей форме»');
    expect(text).toContain(CONTEXT.url);
    // Markdown-ссылка вида [текст](url) спрятала бы адрес за словом — здесь
    // его не должно быть: учитель должен видеть и мочь открыть сам URL.
    expect(text).not.toMatch(/\[.*\]\(https:\/\//);
  });

  it('вопрос не передан (itemId не пришёл при addLink) — без номера вопроса и без «undefined»', () => {
    const text = linkAttachedMessage('Мария', CONTEXT);

    expect(text).not.toContain('Вопрос');
    expect(text).not.toContain('undefined');
  });

  it('вопрос передан — номер и формулировка в сообщении', () => {
    const text = linkAttachedMessage('Мария', {
      ...CONTEXT,
      question: { order: 2, prompt: 'Покажите стойку golden rooster' },
    });

    expect(text).toContain('Вопрос 2');
    expect(text).toContain('Покажите стойку golden rooster');
  });

  it('формулировка вопроса длиннее лимита — обрезается с многоточием', () => {
    const long = 'а'.repeat(250);

    const text = linkAttachedMessage('Мария', {
      ...CONTEXT,
      question: { order: 1, prompt: long },
    });

    expect(text).toContain('…');
    expect(text).not.toContain(long);
  });

  it('формулировка короче лимита — идёт как есть, без обрезки', () => {
    const text = linkAttachedMessage('Мария', {
      ...CONTEXT,
      question: { order: 1, prompt: 'Короткий вопрос' },
    });

    expect(text).toContain('Короткий вопрос');
    expect(text).not.toContain('…');
  });

  it('не спрягает глагол по полу ученика — родовой формы в тексте нет (тот же приём, что attemptSubmittedMessage)', () => {
    const text = linkAttachedMessage('Пётр', CONTEXT);

    expect(text).not.toMatch(/прислал|прислала/);
  });
});
