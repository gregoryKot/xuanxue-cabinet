// Юнит без Mongo (CLAUDE.md «Тесты»): CompositeExamNotifier — просто
// делегирование двум каналам, сам факт и содержимое отправки — дело
// telegram-exam-notifier.spec.ts/mail-exam-notifier.spec.ts.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CompositeExamNotifier } from './exam-notifier.composite';
import type { MailExamNotifier } from '../mail/mail-exam-notifier';
import type { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';

const NOW = DateTime.fromISO('2026-09-17T09:00:00Z', { zone: 'utc' });
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
  userId: 'u1',
};

// Возвращает не TelegramExamNotifier/MailExamNotifier (их методы объявлены
// как методы класса — eslint-plugin @typescript-eslint/unbound-method ловит
// разыменование `obj.method` в expect() как потенциальную потерю `this`),
// а обычные свойства-функции: для composite важно только «позвали с такими
// аргументами», не форма класса.
interface FakeNotifier {
  notifyAttemptSubmitted: jest.Mock;
  notifyExamGraded: jest.Mock;
}

function fakeNotifier(behavior: 'ok' | 'throws' = 'ok'): FakeNotifier {
  const impl =
    behavior === 'ok'
      ? jest.fn().mockResolvedValue(undefined)
      : jest.fn().mockRejectedValue(new Error('канал упал'));
  return { notifyAttemptSubmitted: impl, notifyExamGraded: impl };
}

function buildComposite(
  telegram: FakeNotifier,
  mail: FakeNotifier,
): CompositeExamNotifier {
  return new CompositeExamNotifier(
    telegram as unknown as TelegramExamNotifier,
    mail as unknown as MailExamNotifier,
  );
}

describe('CompositeExamNotifier', () => {
  it('notifyAttemptSubmitted — зовёт оба канала', async () => {
    const telegram = fakeNotifier();
    const mail = fakeNotifier();

    await buildComposite(telegram, mail).notifyAttemptSubmitted(ATTEMPT_CONTEXT, NOW);

    expect(telegram.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
    expect(mail.notifyAttemptSubmitted).toHaveBeenCalledWith(ATTEMPT_CONTEXT, NOW);
  });

  it('notifyExamGraded — зовёт оба канала', async () => {
    const telegram = fakeNotifier();
    const mail = fakeNotifier();
    const context = {
      ...ATTEMPT_CONTEXT,
      outcome: 'passed' as const,
      comment: undefined,
    };

    await buildComposite(telegram, mail).notifyExamGraded(context, NOW);

    expect(telegram.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
    expect(mail.notifyExamGraded).toHaveBeenCalledWith(context, NOW);
  });

  it('один канал бросил (не должен, но вдруг) — второй всё равно вызван, наружу не летит', async () => {
    const telegram = fakeNotifier('throws');
    const mail = fakeNotifier('ok');

    await expect(
      buildComposite(telegram, mail).notifyAttemptSubmitted(ATTEMPT_CONTEXT, NOW),
    ).resolves.toBeUndefined();
    expect(mail.notifyAttemptSubmitted).toHaveBeenCalled();
  });

  it('сбой одного канала — warn-лог с attemptId, не тишина', async () => {
    const telegram = fakeNotifier('throws');
    const mail = fakeNotifier('ok');
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await buildComposite(telegram, mail).notifyAttemptSubmitted(ATTEMPT_CONTEXT, NOW);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('канал упал'),
      expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
    );
    warn.mockRestore();
  });
});
