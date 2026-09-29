// Текст политики — чистая логика без DOM. Три гарантии (ADR-0155):
// 1) все пункты статьи 11 Закона о защите частной жизни есть в тексте;
// 2) сроки хранения в тексте — из констант, по которым данные удаляются на
//    самом деле, а не написаны числом (подмена констант доезжает до текста);
// 3) подрядчики из PRIVACY_RECIPIENTS все названы в тексте.
// Сверка подрядчиков с настройками и CSP — api/src/security/privacy-recipients.spec.ts;
// раздел про ответственного — privacyControllerText.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as shared from '@xuanxue/shared';
import { PRIVACY_RECIPIENTS } from '@xuanxue/shared';
import {
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  type PrivacySection,
} from './privacyPolicyText';

function textOf(sections: readonly PrivacySection[]): string {
  return sections.flatMap((section) => [section.title, ...section.paragraphs]).join('\n');
}

const FULL_TEXT = textOf(PRIVACY_SECTIONS);

describe('PRIVACY_SECTIONS — пункты статьи 11', () => {
  // Слово-маркер на каждый пункт: убрали раздел или переписали его без сути —
  // тест красный. Пункт 2а живёт отдельно (buildControllerParagraphs выше).
  it.each([
    ['(1) добровольность и последствие отказа', 'добровольно'],
    ['(1) что будет без данных', 'Что будет, если не давать данные'],
    ['(2) зачем данные', 'Зачем'],
    ['(3) кому передаются', 'Кому мы передаём данные'],
    ['(3) что данные хранятся вне Израиля', 'вне Израиля'],
    ['(4) право посмотреть', 'посмотреть'],
    ['(4) право потребовать исправить', 'исправить'],
    ['право удалить аккаунт', 'удалить аккаунт'],
  ])('%s', (_item, marker) => {
    expect(FULL_TEXT).toContain(marker);
  });

  it('вводная строка и все абзацы не содержат непарных маркеров акцента', () => {
    const everything = [PRIVACY_INTRO, ...FULL_TEXT.split('\n')];

    for (const line of everything) {
      expect((line.match(/\*\*/g) ?? []).length % 2).toBe(0);
    }
  });

  it('каждый подрядчик из PRIVACY_RECIPIENTS назван в тексте, включая PostHog и GitHub', () => {
    for (const { name } of PRIVACY_RECIPIENTS) {
      expect(FULL_TEXT).toContain(`**${name}**`);
    }
    expect(FULL_TEXT).toContain('**PostHog (ЕС)**');
    expect(FULL_TEXT).toContain('**GitHub**');
  });

  // Срок попытки экзамена исполняет шаг тика (ADR-0153): страница называет тот
  // же срок из константы, а не «пока существует аккаунт».
  it('ответы на экзамены хранятся EXAM_ATTEMPT_RETENTION_YEARS лет после результата', () => {
    const years = shared.formatYearsRu(shared.EXAM_ATTEMPT_RETENTION_YEARS);

    expect(FULL_TEXT).toContain(
      `Ответы на экзамены и оценки — **${years}** после результата`,
    );
    expect(FULL_TEXT).not.toMatch(/ответы на экзамены[^\n]*пока существует аккаунт/i);
  });

  it('срок ответа на запрос посмотреть данные — из константы, 30 дней по закону', () => {
    expect(FULL_TEXT).toContain(
      `Школа ответит в течение **${shared.formatDaysRu(shared.PRIVACY_ACCESS_REPLY_DAYS)}**`,
    );
    expect(shared.PRIVACY_ACCESS_REPLY_DAYS).toBe(30);
  });
});

// Подменяем константы срока и импортируем текст заново: если число в тексте
// написано руками, подмена до него не дойдёт, и тест красный. Значения взяты
// не похожими на настоящие и в разных падежах («41 день», «53 дня», «97 дней»).
describe('сроки хранения берутся из констант, а не написаны числом', () => {
  afterEach(() => {
    vi.doUnmock('@xuanxue/shared');
    vi.resetModules();
  });

  it('подмена каждой константы срока видна в тексте', async () => {
    vi.resetModules();
    vi.doMock('@xuanxue/shared', () => ({
      ...shared,
      PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS: 41,
      PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS: 97,
      ANSWER_VIDEO_RETENTION: { afterGradedDays: 53, ungradedDays: 401 },
      NOTIFICATION_RETENTION_DAYS: 61,
      EXAM_ATTEMPT_RETENTION_YEARS: 11,
      APP_ERROR_LIMITS: { ...shared.APP_ERROR_LIMITS, retentionDays: 13 },
      BACKUP_RETENTION_DAYS: 77,
      PRIVACY_ACCESS_REPLY_DAYS: 17,
    }));

    const fresh = await import('./privacyPolicyText');
    const text = textOf(fresh.PRIVACY_SECTIONS);

    for (const expected of [
      '41 день',
      '97 дней',
      '53 дня',
      '401 день',
      '61 день',
      '13 дней',
      '77 дней',
      '17 дней',
      '11 лет',
    ]) {
      expect(text).toContain(`**${expected}**`);
    }
  });
});
