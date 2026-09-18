// Test.createTestingModule с фейком сервиса — образец broadcasts.controller.spec.ts:
// без HTTP, без Mongo. Роли/CSRF/404 проверяет e2e (settings.e2e-spec.ts).
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import {
  DEFAULT_MATERIALS_PAID_ACCESS,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

const SETTINGS_DTO: SettingsDto = {
  templates: { lesson_link: 'ссылка', recording: 'запись' },
  tz: 'Asia/Jerusalem',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  materialsPaidAccess: DEFAULT_MATERIALS_PAID_ACCESS,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

async function buildController(
  service: Partial<SettingsService> = {},
): Promise<SettingsController> {
  const module = await Test.createTestingModule({
    controllers: [SettingsController],
    providers: [{ provide: SettingsService, useValue: service }],
  }).compile();
  return module.get(SettingsController);
}

describe('SettingsController', () => {
  it('get() вызывает сервис без аргументов', async () => {
    const get = jest.fn().mockResolvedValue(SETTINGS_DTO);
    const controller = await buildController({ get });

    await expect(controller.get()).resolves.toEqual(SETTINGS_DTO);
    expect(get).toHaveBeenCalledWith();
  });

  it('update() передаёт тело в сервис', async () => {
    const update = jest.fn().mockResolvedValue(SETTINGS_DTO);
    const controller = await buildController({ update });
    const body = { templates: { recording: 'новый текст' } };

    await expect(controller.update(body)).resolves.toEqual(SETTINGS_DTO);
    expect(update).toHaveBeenCalledWith(body);
  });

  it('update() передаёт schoolSiteUrl (включая null — сброс) в сервис как есть', async () => {
    const update = jest.fn().mockResolvedValue(SETTINGS_DTO);
    const controller = await buildController({ update });
    const body = { schoolSiteUrl: null };

    await expect(controller.update(body)).resolves.toEqual(SETTINGS_DTO);
    expect(update).toHaveBeenCalledWith(body);
  });

  it('update() передаёт materialsPaidAccess в сервис', async () => {
    const update = jest.fn().mockResolvedValue(SETTINGS_DTO);
    const controller = await buildController({ update });
    const body = { materialsPaidAccess: true };

    await expect(controller.update(body)).resolves.toEqual(SETTINGS_DTO);
    expect(update).toHaveBeenCalledWith(body);
  });

  it('preview() передаёт тело и now в сервис', async () => {
    const preview = jest.fn().mockResolvedValue({ text: 'Через 10 минут занятие' });
    const controller = await buildController({ preview });
    const body = { kind: 'lesson_link' as const, lessonId: 'l1' };

    await expect(controller.preview(body)).resolves.toEqual({
      text: 'Через 10 минут занятие',
    });
    // `now` — DateTime.utc() контроллера, конкретный момент проверен в
    // settings.service.spec.ts.
    expect(preview).toHaveBeenCalledWith(body, expect.any(DateTime));
  });
});
