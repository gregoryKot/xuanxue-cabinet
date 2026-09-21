// Юнит без Mongo (CLAUDE.md «Тесты»): ExamMediaLinkNotifier — делегирование
// двум каналам через Promise.allSettled, тем же приёмом, что
// exam-notifier.composite.spec.ts. Содержимое отправки — дело
// telegram-exam-notifier.spec.ts/in-app-exam-notifier.spec.ts (там же
// живут фикстуры обоих плеч).
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ExamMediaLinkNotifier } from './exam-media-link-notifier';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.registry';
import type { InAppVideoLinkNotifier } from '../notifications/in-app-video-link-notifier';
import type { TelegramVideoLinkNotifier } from '../telegram/telegram-video-link-notifier';

const NOW = DateTime.fromISO('2026-09-21T09:00:00Z', { zone: 'utc' });
const CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
  userId: 'u1',
  questionPrompt: 'Повторите форму Ци-ши',
  url: 'https://vk.com/video-1',
};

interface FakeNotifier {
  notifyVideoLinkAdded: jest.Mock;
}

function fakeNotifier(behavior: 'ok' | 'throws' = 'ok'): FakeNotifier {
  return {
    notifyVideoLinkAdded:
      behavior === 'ok'
        ? jest.fn().mockResolvedValue(undefined)
        : jest.fn().mockRejectedValue(new Error('канал упал')),
  };
}

function build(
  inApp: FakeNotifier,
  telegram: FakeNotifier,
): { notifier: ExamMediaLinkNotifier; registry: ExamMediaNotifierRegistry } {
  const registry = new ExamMediaNotifierRegistry();
  const notifier = new ExamMediaLinkNotifier(
    inApp as unknown as InAppVideoLinkNotifier,
    telegram as unknown as TelegramVideoLinkNotifier,
    registry,
  );
  return { notifier, registry };
}

describe('ExamMediaLinkNotifier', () => {
  it('зовёт оба канала с тем же контекстом', async () => {
    const inApp = fakeNotifier();
    const telegram = fakeNotifier();
    const { notifier } = build(inApp, telegram);

    await notifier.notifyVideoLinkAdded(CONTEXT, NOW);

    expect(inApp.notifyVideoLinkAdded).toHaveBeenCalledWith(CONTEXT, NOW);
    expect(telegram.notifyVideoLinkAdded).toHaveBeenCalledWith(CONTEXT, NOW);
  });

  it('один канал бросил (не должен, но вдруг) — другой всё равно вызван, наружу не летит', async () => {
    const inApp = fakeNotifier('ok');
    const telegram = fakeNotifier('throws');
    const { notifier } = build(inApp, telegram);

    await expect(notifier.notifyVideoLinkAdded(CONTEXT, NOW)).resolves.toBeUndefined();
    expect(inApp.notifyVideoLinkAdded).toHaveBeenCalled();
  });

  it('сбой канала — warn-лог с attemptId и examId, без PII', async () => {
    const inApp = fakeNotifier('ok');
    const telegram = fakeNotifier('throws');
    const { notifier } = build(inApp, telegram);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await notifier.notifyVideoLinkAdded(CONTEXT, NOW);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('канал упал'), {
      attemptId: CONTEXT.attemptId,
      examId: CONTEXT.examId,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(CONTEXT.url);
    warn.mockRestore();
  });

  it('onModuleInit кладёт себя в реестр', () => {
    const { notifier, registry } = build(fakeNotifier(), fakeNotifier());

    notifier.onModuleInit();

    expect(registry.getOrNull()).toBe(notifier);
  });
});
