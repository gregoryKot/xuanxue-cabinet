// Обвязка тестов тоже код, и её ошибка стоит дорого: молчаливо «успешный»
// запрос по пути, который экран вообще не должен звать, превращает тест в
// зелёный шум. Плюс ветка «неожиданный путь» иначе покрывается случайно —
// в CI она однажды не покрылась вовсе (падение `web` на PR #74).
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { mockApiByPath } from './apiFetchMock';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

describe('mockApiByPath', () => {
  it('путь совпал по префиксу — отдаёт значение', async () => {
    mockApiByPath({ '/lessons': [{ id: 'l1' }] });

    await expect(apiFetch('/lessons?from=a&to=b')).resolves.toEqual([{ id: 'l1' }]);
  });

  it('значение — Error: путь отвечает отказом, а не объектом ошибки', async () => {
    mockApiByPath({ '/summary': new Error('network down') });

    await expect(apiFetch('/summary')).rejects.toThrow('network down');
  });

  it('путь не описан — отказ с самим путём в тексте, чтобы было видно, кто его позвал', async () => {
    mockApiByPath({ '/summary': {} });

    await expect(apiFetch('/classes')).rejects.toThrow('неожиданный путь: /classes');
  });
});
