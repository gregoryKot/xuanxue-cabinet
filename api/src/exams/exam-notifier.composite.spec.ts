// Юнит без Mongo (CLAUDE.md «Тесты»): CompositeExamNotifier — просто
// делегирование двум каналам, сам факт и содержимое отправки — дело
// in-app-exam-notifier.spec.ts/telegram-exam-notifier.spec.ts.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CompositeExamNotifier } from './exam-notifier.composite';
import type { InAppExamNotifier } from '../notifications/in-app-exam-notifier';
import type { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';

const NOW = DateTime.fromISO('2026-09-17T09:00:00Z', { zone: 'utc' });
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
  userId: 'u1',
};

// Возвращает не InAppExamNotifier/TelegramExamNotifier (их методы объявлены
// как методы класса — eslint-plugin @typescript-eslint/unbound-method ловит
// разыменование `obj.method` в expect() как потенциальную потерю `this`), а
// обычные свойства-функции: для composite важно только «позвали с такими
// аргументами», не форма класса.
interface FakeNotifier {
  notifyAttemptSubmitted: jest.Mock;
  notifyExamGraded: jest.Mock;
}

function fakeNotifier(behavior: 'ok' | 'throws' = 'ok', recipients = 1): FakeNotifier {
  const impl =
    behavior === 'ok'
      ? jest.fn().mockResolvedValue({ recipients })
      : jest.fn().mockRejectedValue(new Error('канал упал'));
  return { notifyAttemptSubmitted: impl, notifyExamGraded: impl };
}

function buildComposite(
  inApp: FakeNotifier,
  telegram: FakeNotifier,
): CompositeExamNotifier {
  return new CompositeExamNotifier(
    inApp as unknown as InAppExamNotifier,
    telegram as unknown as TelegramExamNotifier,
  );
}

describe('CompositeExamNotifier', () => {
  it('notifyAttemptSubmitted — зовёт оба канала', async () => {
    const inApp = fakeNotifier();
    const telegram = fakeNotifier();

    await buildComposite(inApp, telegram).notifyAttemptSubmitted(ATTEMPT_CONTEXT, NOW);

    expect(inApp.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
    expect(telegram.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
  });

  it('notifyExamGraded — зовёт оба канала', async () => {
    const inApp = fakeNotifier();
    const telegram = fakeNotifier();
    const context = {
      ...ATTEMPT_CONTEXT,
      outcome: 'passed' as const,
      comment: undefined,
    };

    await buildComposite(inApp, telegram).notifyExamGraded(context, NOW);

    expect(inApp.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
    expect(telegram.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
  });

  it('один канал бросил (не должен, но вдруг) — другой всё равно вызван, наружу не летит', async () => {
    const inApp = fakeNotifier('ok');
    const telegram = fakeNotifier('throws');

    await expect(
      buildComposite(inApp, telegram).notifyAttemptSubmitted(ATTEMPT_CONTEXT, NOW),
    ).resolves.toEqual({ recipients: 1 });
    expect(inApp.notifyAttemptSubmitted).toHaveBeenCalled();
  });

  it('сбой одного канала — warn-лог с attemptId, не тишина', async () => {
    const inApp = fakeNotifier('ok');
    const telegram = fakeNotifier('throws');
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await buildComposite(inApp, telegram).notifyAttemptSubmitted(ATTEMPT_CONTEXT, NOW);

    // Тот же warn, что раньше искали по attemptId, теперь несёт ещё examId
    // и kind — ровно те же три ключа, что у нового error ниже: один формат
    // ключей на оба уровня лога, не два разных.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('канал упал'), {
      attemptId: ATTEMPT_CONTEXT.attemptId,
      examId: ATTEMPT_CONTEXT.examId,
      kind: 'attempt_submitted',
    });
    warn.mockRestore();
  });

  // Раньше сбой обоих каналов был виден только как N отдельных warn — их
  // приходилось сопоставлять руками, чтобы понять, что уведомление не дошло
  // никому. Один error с recipients === 0 — сигнал, который ищут по тексту
  // в логах Railway, без сопоставления (CLAUDE.md «Логи и наблюдаемость»):
  // тихий отказ — самая дорогая ошибка в продукте про рассылки.
  it('оба канала не нашли адресата — ровно один error-лог, без userId в ключах', async () => {
    const inApp = fakeNotifier('ok', 0);
    const telegram = fakeNotifier('ok', 0);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 0 });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'exam.notify (composite): уведомление не ушло никому',
      {
        attemptId: ATTEMPT_CONTEXT.attemptId,
        examId: ATTEMPT_CONTEXT.examId,
        kind: 'attempt_submitted',
      },
    );
    // Ключи — без PII: по логу ищут по attemptId, `userId` в него не уходит
    // (CLAUDE.md «Логи и наблюдаемость»).
    expect(JSON.stringify(error.mock.calls)).not.toContain(ATTEMPT_CONTEXT.userId);
    error.mockRestore();
  });

  it('notifyExamGraded, оба канала без адресата — error с kind exam_result', async () => {
    const inApp = fakeNotifier('ok', 0);
    const telegram = fakeNotifier('ok', 0);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const context = {
      ...ATTEMPT_CONTEXT,
      outcome: 'passed' as const,
      comment: undefined,
    };

    const result = await buildComposite(inApp, telegram).notifyExamGraded(context, NOW);

    expect(result).toEqual({ recipients: 0 });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'exam.notify (composite): уведомление не ушло никому',
      {
        attemptId: ATTEMPT_CONTEXT.attemptId,
        examId: ATTEMPT_CONTEXT.examId,
        kind: 'exam_result',
      },
    );
    error.mockRestore();
  });

  it('кабинет нашёл адресата, Telegram — нет: error не пишется, сумма из одного канала', async () => {
    const inApp = fakeNotifier('ok', 5);
    const telegram = fakeNotifier('ok', 0);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 5 });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('Telegram нашёл адресата, кабинет — нет: error не пишется, сумма из одного канала', async () => {
    const inApp = fakeNotifier('ok', 0);
    const telegram = fakeNotifier('ok', 3);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 3 });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('канал бросил, другой нашёл адресата — warn есть, error не пишется', async () => {
    const inApp = fakeNotifier('throws');
    const telegram = fakeNotifier('ok', 4);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 4 });
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it('оба канала бросили — error есть, никому не дошло', async () => {
    const inApp = fakeNotifier('throws');
    const telegram = fakeNotifier('throws');
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 0 });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'exam.notify (composite): уведомление не ушло никому',
      {
        attemptId: ATTEMPT_CONTEXT.attemptId,
        examId: ATTEMPT_CONTEXT.examId,
        kind: 'attempt_submitted',
      },
    );
    warn.mockRestore();
    error.mockRestore();
  });
});
