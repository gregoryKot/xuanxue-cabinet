// Форма тела PUT /me/notifications/lessons/scope (ADR-0162) без HTTP. Что
// занятия существуют, а не просто похожи на id, проверяет
// lesson-notifications.service.spec.ts; сквозной 400 — e2e
// (api/test/lesson-notifications.e2e-spec.ts).
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LESSON_SCOPE_CLASS_IDS_MAX } from '@xuanxue/shared';
import { UpdateLessonScopeDto } from './update-lesson-scope.dto';

const ID_A = '64b7f0c2a1b2c3d4e5f60718';
const ID_B = '64b7f0c2a1b2c3d4e5f60719';

async function errorsFor(body: unknown): Promise<number> {
  const errors = await validate(plainToInstance(UpdateLessonScopeDto, body));
  return errors.length;
}

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => i.toString(16).padStart(24, '0'));
}

describe('UpdateLessonScopeDto', () => {
  it('«все» с пустым списком и «выбранные» со списком принимаются', async () => {
    expect(await errorsFor({ mode: 'all', classIds: [] })).toBe(0);
    expect(await errorsFor({ mode: 'selected', classIds: [ID_A, ID_B] })).toBe(0);
  });

  it('ровно максимум id принимается, на один больше — нет', async () => {
    expect(
      await errorsFor({ mode: 'selected', classIds: ids(LESSON_SCOPE_CLASS_IDS_MAX) }),
    ).toBe(0);
    expect(
      await errorsFor({
        mode: 'selected',
        classIds: ids(LESSON_SCOPE_CLASS_IDS_MAX + 1),
      }),
    ).toBeGreaterThan(0);
  });

  it.each(['none', '', 'ALL', 1, null, undefined])(
    'режим %p отклоняется',
    async (mode) => {
      expect(await errorsFor({ mode, classIds: [] })).toBeGreaterThan(0);
    },
  );

  it.each([
    ['не массив', ID_A],
    ['нет поля', undefined],
    ['null', null],
    ['не ObjectId', ['abc']],
    ['число вместо id', [123]],
    ['один хороший и один плохой', [ID_A, 'плохой']],
  ])('список «%s» отклоняется', async (_name, classIds) => {
    expect(await errorsFor({ mode: 'selected', classIds })).toBeGreaterThan(0);
  });
});
