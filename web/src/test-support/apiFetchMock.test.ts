// Обвязка тестов тоже код, и её ошибка стоит дорого: молчаливо «успешный»
// запрос по пути, который экран вообще не должен звать, превращает тест в
// зелёный шум. Плюс ветка «неожиданный путь» иначе покрывается случайно —
// в CI она однажды не покрылась вовсе (падение `web` на PR #74).
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import {
  failNextWrite,
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from './apiFetchMock';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const SAVE_ERROR = 'Проверьте поля.';
const PATCH = { method: 'PATCH', body: {} } as const;

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

describe('failNextWrite', () => {
  // Ради этого он и заведён: раньше тест ставил mockRejectedValueOnce, и
  // ошибку мог забрать любой следующий запрос — в том числе тот, что экран
  // догружает сам (подсказка тегов формы материала). Мигало 6 раз на 300
  // монтирований, расследование 2026-09-20.
  it('ошибку получает сохранение, а чтение между делом — свой обычный ответ', async () => {
    mockApiByPath({ '/materials': [{ id: 'm1' }] });
    failNextWrite(new Error(SAVE_ERROR));

    await expect(apiFetch('/materials?limit=200')).resolves.toEqual([{ id: 'm1' }]);
    await expect(apiFetch('/materials/m1', PATCH)).rejects.toThrow(SAVE_ERROR);
  });

  it('ошибка одноразовая — повтор сохранения проходит', async () => {
    mockApiByPath({ '/materials': { id: 'm1' } });
    failNextWrite(new Error(SAVE_ERROR));

    await expect(apiFetch('/materials/m1', PATCH)).rejects.toThrow(SAVE_ERROR);
    await expect(apiFetch('/materials/m1', PATCH)).resolves.toEqual({ id: 'm1' });
  });

  it('ответы ещё не заданы — отказ сразу, а не молчаливо пропущенная ошибка', () => {
    mockedApiFetch.mockReset();

    expect(() => failNextWrite(new Error(SAVE_ERROR))).toThrow('failNextWrite');
  });
});
