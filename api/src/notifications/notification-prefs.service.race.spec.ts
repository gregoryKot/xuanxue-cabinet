// Гонка двух кликов и сбои базы — фейк модели воспроизводит именно эти
// сценарии детерминированно, настоящая Mongo для них мигала бы (тот же
// приём, что users.service.race.spec.ts, lesson-planner.service.duplicate.spec.ts).
// Обычный путь (без гонки) проверен на настоящей Mongo —
// notification-prefs.service.spec.ts.
import type { Model } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import type { NotificationPrefsRecord } from './notification-prefs.schema';
import { NotificationPrefsService } from './notification-prefs.service';

function fakeModel(overrides: {
  exists?: () => Promise<unknown>;
  create?: () => Promise<unknown>;
  updateOne?: () => Promise<{ matchedCount: number }>;
}): Model<NotificationPrefsRecord> {
  return {
    exists: overrides.exists ?? (() => Promise.resolve(null)),
    create: overrides.create ?? (() => Promise.resolve({})),
    updateOne: overrides.updateOne ?? (() => Promise.resolve({ matchedCount: 0 })),
  } as unknown as Model<NotificationPrefsRecord>;
}

describe('NotificationPrefsService.set — гонка и сбои', () => {
  it('обе попытки первого витка промахнулись (конкурент успел вставить) — второй виток довершает', async () => {
    let call = 0;
    const service = new NotificationPrefsService(
      fakeModel({
        updateOne: () => {
          call += 1;
          // 1 — update по kind (мимо), 2 — push по $ne (мимо, гонка), 3 —
          // update по kind на втором витке: конкурент уже вставил kind.
          return Promise.resolve({ matchedCount: call === 3 ? 1 : 0 });
        },
      }),
    );

    await expect(service.set('u1', 'post_draft', true)).resolves.toBeUndefined();
    expect(call).toBe(3);
  });

  it('гонка не заканчивается за SET_RETRY_LIMIT попыток — явная ошибка, не тихое зависание', async () => {
    const service = new NotificationPrefsService(fakeModel({}));

    await expect(service.set('u1', 'post_draft', true)).rejects.toThrow(
      'Не получилось сохранить настройку',
    );
  });

  it('ensureDoc: ошибка создания документа, отличная от E11000, уходит наверх', async () => {
    const service = new NotificationPrefsService(
      fakeModel({ create: () => Promise.reject(new Error('база недоступна')) }),
    );

    await expect(service.set('u1', 'post_draft', true)).rejects.toThrow(
      'база недоступна',
    );
  });

  it('ensureDoc: E11000 при создании (гонка первого клика) — не бросает, запись довершается', async () => {
    let call = 0;
    const service = new NotificationPrefsService(
      fakeModel({
        create: () =>
          Promise.reject(
            Object.assign(new Error('E11000'), { code: MONGO_DUPLICATE_KEY_CODE }),
          ),
        updateOne: () => {
          call += 1;
          return Promise.resolve({ matchedCount: call === 2 ? 1 : 0 });
        },
      }),
    );

    await expect(service.set('u1', 'post_draft', true)).resolves.toBeUndefined();
  });
});
