// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { videoLinkAddedMessage } from './video-link-added-message';

const EXAM_TITLE = 'Экзамен по третьей форме';
const URL = 'https://vk.com/video-1';
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const PUBLIC_URL = 'https://cabinet.example';

function build(
  overrides: Partial<Parameters<typeof videoLinkAddedMessage>[0]> = {},
  publicUrl: string | undefined = PUBLIC_URL,
): string {
  return videoLinkAddedMessage(
    {
      studentName: 'Мария',
      examTitle: EXAM_TITLE,
      questionPrompt: 'Повторите форму Ци-ши',
      url: URL,
      attemptId: ATTEMPT_ID,
      ...overrides,
    },
    publicUrl,
  );
}

describe('videoLinkAddedMessage', () => {
  it('имя, экзамен, формулировка вопроса и сама ссылка — всё на месте', () => {
    const text = build();

    expect(text).toContain('Мария');
    expect(text).toContain(`«${EXAM_TITLE}»`);
    expect(text).toContain('Повторите форму Ци-ши');
    expect(text).toContain(URL);
  });

  // Вопрос называется формулировкой, а не номером: номеров у него три разных
  // (карточка проверки, сводка бота, форма сдачи) — media-item-lookup.ts.
  it('формулировки нет — фраза без «null» и без пустого хвоста «Вопрос: »', () => {
    const text = build({ questionPrompt: null });

    expect(text).not.toContain('null');
    expect(text).not.toContain('Вопрос:');
    expect(text).toContain(`«${EXAM_TITLE}».`);
    expect(text).toContain(URL);
  });

  it('длинная формулировка обрезается — письмо про одну ссылку не растёт на два экрана', () => {
    const text = build({ questionPrompt: 'я'.repeat(300) });

    expect(text).toContain('…');
    expect(text.length).toBeLessThan(400);
  });

  it('есть PUBLIC_URL — ведём и на карточку проверки, не только на видео', () => {
    expect(build()).toContain(`${PUBLIC_URL}/grading/${ATTEMPT_ID}`);
  });

  // ADR-0009: ссылки только от PUBLIC_URL — без него в тексте не должно
  // появиться «undefined/grading/...».
  it('PUBLIC_URL не задан — сообщение без карточки, а не с «undefined»', () => {
    // Зовём напрямую, а не через build(): значение по умолчанию у параметра
    // подставилось бы ровно на `undefined`, и тест проверял бы не тот случай.
    const text = videoLinkAddedMessage(
      {
        studentName: 'Мария',
        examTitle: EXAM_TITLE,
        questionPrompt: 'Повторите форму Ци-ши',
        url: URL,
        attemptId: ATTEMPT_ID,
      },
      undefined,
    );

    expect(text).not.toContain('undefined');
    expect(text).not.toContain('/grading/');
    expect(text).toContain(URL);
  });

  it('не спрягает глагол по полу ученика — родовой формы в тексте нет', () => {
    expect(build({ studentName: 'Пётр' })).not.toMatch(/прислал|прислала/);
  });
});
