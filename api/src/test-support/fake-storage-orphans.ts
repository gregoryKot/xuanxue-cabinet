// Фейк журнала сирот (ADR-0076) для спеков, которым нужен MaterialsService,
// но не нужна уборка объектов: удаление материала не должно зависеть от
// доступности R2. Своё поведение журнал проверяет в
// storage-orphans.service.spec.ts.
//
// Общий хелпер, а не копия в каждом спеке (CLAUDE.md «Дубли», jscpd):
// MaterialsService поднимают три разных спека.
//
// `removeNow` возвращается отдельно от объекта — eslint
// (@typescript-eslint/unbound-method) ругается на метод, снятый с объекта, в
// expect(); тот же приём, что в scheduler.service.spec.ts.
import type { StorageOrphansService } from '../storage/storage-orphans.service';

export interface FakeStorageOrphans {
  service: StorageOrphansService;
  removeNow: jest.Mock;
}

export function fakeStorageOrphans(): FakeStorageOrphans {
  const removeNow = jest.fn().mockResolvedValue(undefined);
  return {
    service: {
      track: jest.fn().mockResolvedValue(undefined),
      forget: jest.fn().mockResolvedValue(undefined),
      removeNow,
    } as unknown as StorageOrphansService,
    removeNow,
  };
}
