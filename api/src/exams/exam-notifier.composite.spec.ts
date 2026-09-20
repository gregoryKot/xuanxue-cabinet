// Юнит без Mongo (CLAUDE.md «Тесты»): CompositeExamNotifier — просто
// делегирование трём каналам, сам факт и содержимое отправки — дело
// in-app-exam-notifier.spec.ts/telegram-exam-notifier.spec.ts/mail-exam-notifier.spec.ts.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CompositeExamNotifier } from './exam-notifier.composite';
import type { MailExamNotifier } from '../mail/mail-exam-notifier';
import type { InAppExamNotifier } from '../notifications/in-app-exam-notifier';
import type { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';

const NOW = DateTime.fromISO('2026-09-17T09:00:00Z', { zone: 'utc' });
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
  userId: 'u1',
};

// Возвращает не InAppExamNotifier/TelegramExamNotifier/MailExamNotifier (их
// методы объявлены как методы класса — eslint-plugin @typescript-eslint/
// unbound-method ловит разыменование `obj.method` в expect() как
// потенциальную потерю `this`), а обычные свойства-функции: для composite
// важно только «позвали с такими аргументами», не форма класса.
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
  mail: FakeNotifier,
): CompositeExamNotifier {
  return new CompositeExamNotifier(
    inApp as unknown as InAppExamNotifier,
    telegram as unknown as TelegramExamNotifier,
    mail as unknown as MailExamNotifier,
  );
}

describe('CompositeExamNotifier', () => {
  it('notifyAttemptSubmitted — зовёт все три канала', async () => {
    const inApp = fakeNotifier();
    const telegram = fakeNotifier();
    const mail = fakeNotifier();

    await buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(inApp.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
    expect(telegram.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
    expect(mail.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
  });

  it('notifyExamGraded — зовёт все три канала', async () => {
    const inApp = fakeNotifier();
    const telegram = fakeNotifier();
    const mail = fakeNotifier();
    const context = {
      ...ATTEMPT_CONTEXT,
      outcome: 'passed' as const,
      comment: undefined,
    };

    await buildComposite(inApp, telegram, mail).notifyExamGraded(context, NOW);

    expect(inApp.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
    expect(telegram.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
    expect(mail.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
  });

  it('один канал бросил (не должен, но вдруг) — остальные всё равно вызваны, наружу не летит', async () => {
    const inApp = fakeNotifier('ok');
    const telegram = fakeNotifier('throws');
    const mail = fakeNotifier('ok');

    await expect(
      buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(ATTEMPT_CONTEXT, NOW),
    ).resolves.toEqual({ recipients: 2 });
    expect(inApp.notifyAttemptSubmitted).toHaveBeenCalled();
    expect(mail.notifyAttemptSubmitted).toHaveBeenCalled();
  });

  it('сбой одного канала — warn-лог с attemptId, не тишина', async () => {
    const inApp = fakeNotifier('ok');
    const telegram = fakeNotifier('throws');
    const mail = fakeNotifier('ok');
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

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

  // Раньше сбой всех каналов был виден только как N отдельных warn — их
  // приходилось сопоставлять руками, чтобы понять, что уведомление не дошло
  // никому. Один error с recipients === 0 — сигнал, который ищут по тексту
  // в логах Railway, без сопоставления (CLAUDE.md «Логи и наблюдаемость»):
  // тихий отказ — самая дорогая ошибка в продукте про рассылки.
  it('все три канала не нашли адресата — ровно один error-лог, без userId в ключах', async () => {
    const inApp = fakeNotifier('ok', 0);
    const telegram = fakeNotifier('ok', 0);
    const mail = fakeNotifier('ok', 0);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(
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

  it('notifyExamGraded, все три канала без адресата — error с kind exam_result', async () => {
    const inApp = fakeNotifier('ok', 0);
    const telegram = fakeNotifier('ok', 0);
    const mail = fakeNotifier('ok', 0);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const context = {
      ...ATTEMPT_CONTEXT,
      outcome: 'passed' as const,
      comment: undefined,
    };

    const result = await buildComposite(inApp, telegram, mail).notifyExamGraded(
      context,
      NOW,
    );

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

  it('кабинет нашёл адресата, остальные — нет: error не пишется, сумма из одного канала', async () => {
    const inApp = fakeNotifier('ok', 5);
    const telegram = fakeNotifier('ok', 0);
    const mail = fakeNotifier('ok', 0);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 5 });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('Telegram нашёл адресата, остальные — нет: error не пишется, сумма из одного канала', async () => {
    const inApp = fakeNotifier('ok', 0);
    const telegram = fakeNotifier('ok', 3);
    const mail = fakeNotifier('ok', 0);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 3 });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('почта нашла адресата, остальные — нет: error не пишется, сумма из одного канала', async () => {
    const inApp = fakeNotifier('ok', 0);
    const telegram = fakeNotifier('ok', 0);
    const mail = fakeNotifier('ok', 2);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 2 });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('канал бросил, другой нашёл адресата — warn есть, error не пишется', async () => {
    const inApp = fakeNotifier('throws');
    const telegram = fakeNotifier('ok', 0);
    const mail = fakeNotifier('ok', 4);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(
      ATTEMPT_CONTEXT,
      NOW,
    );

    expect(result).toEqual({ recipients: 4 });
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it('все три канала бросили — error есть, никому не дошло', async () => {
    const inApp = fakeNotifier('throws');
    const telegram = fakeNotifier('throws');
    const mail = fakeNotifier('throws');
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const result = await buildComposite(inApp, telegram, mail).notifyAttemptSubmitted(
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
