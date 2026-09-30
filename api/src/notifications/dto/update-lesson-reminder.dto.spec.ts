// Форма тела PUT /me/notifications/lessons/reminder-minutes (ADR-0162) без
// HTTP: только значения из короткого списка и `null`. Сквозной 400 и владение —
// e2e (api/test/lesson-notifications.e2e-spec.ts).
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LESSON_REMINDER_CHOICES } from '@xuanxue/shared';
import { UpdateLessonReminderDto } from './update-lesson-reminder.dto';

async function errorsFor(body: unknown): Promise<number> {
  const errors = await validate(plainToInstance(UpdateLessonReminderDto, body));
  return errors.length;
}

describe('UpdateLessonReminderDto', () => {
  it.each(LESSON_REMINDER_CHOICES)('пункт списка %p принимается', async (minutes) => {
    expect(await errorsFor({ minutes })).toBe(0);
  });

  it('null — «как в школе» — принимается', async () => {
    expect(await errorsFor({ minutes: null })).toBe(0);
  });

  it.each([
    ['число не из списка', 45],
    ['ноль', 0],
    ['отрицательное', -15],
    ['строка-число', '30'],
    ['дробное', 30.5],
    ['булево', true],
    ['массив', [30]],
    ['нет поля (undefined)', undefined],
  ])('%s отклоняется', async (_name, minutes) => {
    expect(await errorsFor({ minutes })).toBeGreaterThan(0);
  });

  it('пустое тело отклоняется: отсутствие поля — не «как в школе»', async () => {
    expect(await errorsFor({})).toBeGreaterThan(0);
  });
});
