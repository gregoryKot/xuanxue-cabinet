import { describe, expect, it } from 'vitest';
import { EMAIL_LOGIN_RESEND_COOLDOWN_MIN } from '@xuanxue/shared';
import { buildResendCountdownText, resendCooldownSec } from './emailResendCountdown';

const SENT_AT = 1_700_000_000_000;
const COOLDOWN_SEC = EMAIL_LOGIN_RESEND_COOLDOWN_MIN * 60;

// Аудит 2026-10-01, F30: окно повтора на форме — по той же цифре, что у сервера.
describe('resendCooldownSec', () => {
  it('письмо ещё не уходило — 0', () => {
    expect(resendCooldownSec(null, SENT_AT)).toBe(0);
  });

  it('сразу после отправки — весь cooldown', () => {
    expect(resendCooldownSec(SENT_AT, SENT_AT)).toBe(COOLDOWN_SEC);
  });

  it('остаток округляется вверх — «0:01», а не «0:00» с закрытой ссылкой', () => {
    expect(resendCooldownSec(SENT_AT, SENT_AT + (COOLDOWN_SEC - 1) * 1000 + 500)).toBe(1);
  });

  it('окно прошло — 0, и дальше тоже 0', () => {
    expect(resendCooldownSec(SENT_AT, SENT_AT + COOLDOWN_SEC * 1000)).toBe(0);
    expect(resendCooldownSec(SENT_AT, SENT_AT + COOLDOWN_SEC * 1000 + 60_000)).toBe(0);
  });
});

describe('buildResendCountdownText', () => {
  it('минуты и секунды двумя знаками, цифра с акцентом', () => {
    expect(buildResendCountdownText(105)).toBe(
      'Новое письмо можно запросить через **1:45**.',
    );
    expect(buildResendCountdownText(7)).toBe(
      'Новое письмо можно запросить через **0:07**.',
    );
    expect(buildResendCountdownText(120)).toBe(
      'Новое письмо можно запросить через **2:00**.',
    );
  });
});
