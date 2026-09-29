// Напоминание об оплате (ADR-0051): чистая логика без Mongo — маппер с
// дефолтами по полям, проверка плейсхолдеров, `$set` по точечным путям.
import { DEFAULT_PAYMENT_REMINDER } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { toSettingsDto, type LeanSettings } from './settings.mapper';
import {
  assertKnownReminderPlaceholders,
  paymentReminderSetFrom,
} from './settings-payment-reminder';

const BASE: LeanSettings = {
  templates: { lessonLink: 'ссылка', recording: 'запись' },
  tz: 'Asia/Jerusalem',
  updatedAt: new Date('2026-09-06T18:00:00Z'),
};

describe('toSettingsDto — paymentReminder', () => {
  it('старая база без подобъекта — дефолт целиком', () => {
    expect(toSettingsDto(BASE).paymentReminder).toEqual(DEFAULT_PAYMENT_REMINDER);
  });

  it('подобъект с одним полем — остальные приходят дефолтом, не undefined', () => {
    // `$set` по `paymentReminder.enabled` в старой базе создаёт именно такой
    // подобъект.
    const dto = toSettingsDto({ ...BASE, paymentReminder: { enabled: true } });

    expect(dto.paymentReminder).toEqual({ ...DEFAULT_PAYMENT_REMINDER, enabled: true });
  });

  it('сохранённое `enabled: false` и день 1 не подменяются дефолтом', () => {
    const dto = toSettingsDto({
      ...BASE,
      paymentReminder: { enabled: false, dayOfMonth: 1, time: '00:00', template: 'x' },
    });

    expect(dto.paymentReminder).toEqual({
      enabled: false,
      dayOfMonth: 1,
      time: '00:00',
      template: 'x',
    });
  });
});

describe('assertKnownReminderPlaceholders', () => {
  it('без текста в PATCH — не бросает', () => {
    expect(() => assertKnownReminderPlaceholders(undefined)).not.toThrow();
  });

  it('все четыре подстановки напоминания — не бросает', () => {
    expect(() =>
      assertKnownReminderPlaceholders('{имя}, {месяц}, {сумма}, {ссылка}'),
    ).not.toThrow();
  });

  it('подстановка поста `{название}` — InvalidInputError с перечнем доступных', () => {
    expect(() => assertKnownReminderPlaceholders('{название}')).toThrow(
      InvalidInputError,
    );
    expect(() => assertKnownReminderPlaceholders('{название}')).toThrow(
      /\{название\}.*Доступные: \{месяц\}, \{сумма\}, \{имя\}, \{ссылка\}\./,
    );
  });
});

describe('paymentReminderSetFrom', () => {
  it('пишет только переданные поля по точечным путям', () => {
    expect(paymentReminderSetFrom({ enabled: true, dayOfMonth: 31 })).toEqual({
      'paymentReminder.enabled': true,
      'paymentReminder.dayOfMonth': 31,
    });
  });

  it('пустой объект и поля undefined — писать нечего', () => {
    expect(paymentReminderSetFrom({})).toEqual({});
    expect(paymentReminderSetFrom({ time: undefined, template: undefined })).toEqual({});
  });

  it('`enabled: false` — значение, а не «не передано»', () => {
    expect(paymentReminderSetFrom({ enabled: false })).toEqual({
      'paymentReminder.enabled': false,
    });
  });
});
