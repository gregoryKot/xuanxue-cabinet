// Юнит без Mongo (CLAUDE.md «Тесты»): CompositeExamNotifier — просто
// делегирование трём плечам, сам факт и содержимое отправки — дело
// in-app-exam-notifier.spec.ts/telegram-exam-notifier.spec.ts/
// push-exam-notifier.spec.ts.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CompositeExamNotifier } from './exam-notifier.composite';
import type { InAppExamNotifier } from '../notifications/in-app-exam-notifier';
import type { PushExamNotifier } from '../push/push-exam-notifier';
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

// push по умолчанию — 0 адресатов и без падения: тем же приёмом, что и на
// проде, пока никто не подписался (риск за флагом, ADR-0092), push не должен
// менять сумму и поведение тестов, которые его не касаются напрямую.
function buildComposite(
  inApp: FakeNotifier,
  telegram: FakeNotifier,
  push: FakeNotifier = fakeNotifier('ok', 0),
): CompositeExamNotifier {
  return new CompositeExamNotifier(
    inApp as unknown as InAppExamNotifier,
    telegram as unknown as TelegramExamNotifier,
    push as unknown as PushExamNotifier,
  );
}

describe('CompositeExamNotifier', () => {
  it('notifyAttemptSubmitted — зовёт все три плеча', async () => {
    const inApp = fakeNotifier();
    const telegram = fakeNotifier();
    const push = fakeNotifier();

    await buildComposite(inApp, telegram, push).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(inApp.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
    expect(telegram.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
    expect(push.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
  });

  it('notifyExamGraded — зовёт все три плеча', async () => {
    const inApp = fakeNotifier();
    const telegram = fakeNotifier();
    const push = fakeNotifier();
    const context = {
      ...ATTEMPT_CONTEXT,
      outcome: 'passed' as const,
      comment: undefined,
    };

    await buildComposite(inApp, telegram, push).notifyExamGraded(context, NOW);

    expect(inApp.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
    expect(telegram.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
    expect(push.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
  });

  it('кабинет и Telegram без адресата, push нашёл — error не пишется, сумма из push', async () => {
    const inApp = fakeNotifier('ok', 0);
    const telegram = fakeNotifier('ok', 0);
    const push = fakeNotifier('ok', 2);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram, push).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 2 });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('push бросил, два других плеча ok — error не пишется, warn есть', async () => {
    const inApp = fakeNotifier('ok', 1);
    const telegram = fakeNotifier('ok', 1);
    const push = fakeNotifier('throws');
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram, push).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 2 });
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
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
  it('все три плеча не нашли адресата — ровно один error-лог, без userId в ключах', async () => {
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

  it('notifyExamGraded, все три плеча без адресата — error с kind exam_result', async () => {
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
