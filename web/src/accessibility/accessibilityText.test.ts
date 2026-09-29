// Текст страницы «Доступность» — чистая логика без DOM (ADR-0158). Как
// страница рисуется и откуда берёт контакт — AccessibilityScreen.test.tsx;
// что утверждения текста верны для кода — accessibilityClaims.test.ts.
import { describe, expect, it } from 'vitest';
import {
  ACCESSIBILITY_INTRO,
  ACCESSIBILITY_SECTIONS,
  buildAccessibilityContactParagraphs,
} from './accessibilityText';

describe('buildAccessibilityContactParagraphs — куда писать о проблеме', () => {
  it('имя и контакт указаны — оба на странице, выделены как факты', () => {
    expect(
      buildAccessibilityContactParagraphs({
        dataControllerName: 'Дмитрий Дейч',
        dataControllerContact: 'privacy@xuanxue.su',
      }),
    ).toEqual([
      'Сообщения принимает **Дмитрий Дейч**.',
      'Если что-то мешает или нужна адаптация, напишите: **privacy@xuanxue.su**.',
      'Расскажите, **что не получилось** и на каком устройстве: так проще найти причину.',
    ]);
  });

  it('только контакт — имя не выдумывается', () => {
    const paragraphs = buildAccessibilityContactParagraphs({
      dataControllerContact: '@dmitry_deitch',
    });

    expect(paragraphs[0]).toBe(
      'Если что-то мешает или нужна адаптация, напишите: **@dmitry_deitch**.',
    );
    expect(paragraphs.join('\n')).not.toContain('Сообщения принимает');
  });

  it('только имя — способ связи честно отправляет к учителю', () => {
    const paragraphs = buildAccessibilityContactParagraphs({
      dataControllerName: 'Школа Сюань-Сюэ',
    });

    expect(paragraphs[0]).toBe('Сообщения принимает **Школа Сюань-Сюэ**.');
    expect(paragraphs[1]).toContain('**напишите учителю школы**');
  });

  it('школа ничего не указала — честная строка «напишите учителю школы», ни выдуманного адреса', () => {
    const paragraphs = buildAccessibilityContactParagraphs({});

    expect(paragraphs[0]).toBe(
      'Способ связи школа ещё не указала — **напишите учителю школы**.',
    );
    expect(paragraphs).toHaveLength(2);
  });

  it('настройки не загрузились — страница отправляет к учителю и предлагает обновить', () => {
    const [first] = buildAccessibilityContactParagraphs(null);

    expect(first).toContain('Не удалось загрузить');
    expect(first).toContain('**напишите учителю школы**');
  });

  // Имя и адрес вводит школа: звёздочки из ввода склеили бы чужие пары
  // акцентов, а адрес-ссылку с маркером поверх RichText оставил бы
  // звёздочками на экране (то же, что делает раздел на /privacy).
  it('звёздочки из ввода убираются, адрес-ссылка идёт без выделения', () => {
    const paragraphs = buildAccessibilityContactParagraphs({
      dataControllerName: '**Дмитрий** *Дейч*',
      dataControllerContact: 'https://t.me/xuanxue',
    });

    expect(paragraphs.slice(0, 2)).toEqual([
      'Сообщения принимает **Дмитрий Дейч**.',
      'Если что-то мешает или нужна адаптация, напишите: https://t.me/xuanxue.',
    ]);
  });
});

describe('ACCESSIBILITY_SECTIONS — текст страницы', () => {
  const allParagraphs = [
    ACCESSIBILITY_INTRO,
    ...ACCESSIBILITY_SECTIONS.flatMap((section) => section.paragraphs),
  ];

  it('у каждого раздела свой заголовок и хотя бы один абзац', () => {
    const titles = ACCESSIBILITY_SECTIONS.map((section) => section.title);

    expect(new Set(titles).size).toBe(titles.length);
    for (const section of ACCESSIBILITY_SECTIONS) {
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });

  // Абзацы — ключи React в LegalParagraphs: одинаковые склеились бы в один.
  it('абзацы не повторяются', () => {
    expect(new Set(allParagraphs).size).toBe(allParagraphs.length);
  });

  // Половина маркера осталась бы на экране звёздочками (check-text-accents).
  it('маркеры акцента парные в каждом абзаце', () => {
    for (const paragraph of allParagraphs) {
      expect((paragraph.match(/\*\*/g) ?? []).length % 2).toBe(0);
    }
  });

  it('называет стандарт и говорит про ограничения — без них заявление пустое', () => {
    const text = ACCESSIBILITY_SECTIONS.flatMap((s) => [s.title, ...s.paragraphs]).join(
      '\n',
    );

    expect(text).toContain('WCAG 2.0');
    expect(text).toContain('ת"י 5568');
    expect(text).toContain('Субтитров у записей нет');
    expect(text).toContain('по просьбе');
  });
});
