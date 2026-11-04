// Хук списка групп: запись правит список из ответа, без второго GET (ADR-0087).
// Сеть — mockApiByPath по пути запроса (ADR-0116).
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GroupDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { useGroups } from './useGroups';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeGroup(id: string, name: string, classCount = 0): GroupDto {
  return {
    id,
    name,
    classCount,
    channelCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const FIRST = makeGroup('g1', 'Начинающие', 2);
const SECOND = makeGroup('g2', 'Средние');

async function loaded() {
  mockApiByPath({ '/groups': [FIRST, SECOND] });
  const hook = renderHook(() => useGroups());
  await waitFor(() => expect(hook.result.current.groups).toEqual([FIRST, SECOND]));
  return hook;
}

function writeCalls() {
  return mockedApiFetch.mock.calls.filter((call) =>
    ['POST', 'PATCH', 'DELETE'].includes(
      (call[1] as { method?: string } | undefined)?.method ?? '',
    ),
  );
}

describe('useGroups', () => {
  it('create: возвращает группу, она встаёт в конец списка без нового GET', async () => {
    const { result } = await loaded();
    const created = makeGroup('g3', 'Старшие');
    mockApiByPath({ '/groups': created });

    let returned: GroupDto | undefined;
    await act(async () => {
      returned = await result.current.create('Старшие');
    });

    expect(returned).toEqual(created);
    expect(result.current.groups?.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
    expect(mockedApiFetch.mock.calls.map(([path]) => path)).toEqual([
      '/groups',
      '/groups',
    ]);
  });

  it('rename: заменяет группу на месте, порядок и остальные не трогает', async () => {
    const { result } = await loaded();
    mockApiByPath({ '/groups/g1': makeGroup('g1', 'Новички', 2) });

    await act(async () => {
      await result.current.rename('g1', 'Новички');
    });

    expect(result.current.groups?.map((g) => g.name)).toEqual(['Новички', 'Средние']);
    expect(writeCalls()[0]).toEqual([
      '/groups/g1',
      expect.objectContaining({ method: 'PATCH', body: { name: 'Новички' } }),
    ]);
  });

  it('remove: убирает группу из списка', async () => {
    const { result } = await loaded();
    mockApiByPath({ '/groups/g2': undefined });

    await act(async () => {
      await result.current.remove('g2');
    });

    expect(result.current.groups?.map((g) => g.id)).toEqual(['g1']);
  });

  it('сбой записи уходит вызывающему, список остаётся прежним', async () => {
    const { result } = await loaded();
    mockApiByPath({ '/groups': new ApiError('Группа уже есть.', 409, 'conflict') });

    await expect(result.current.create('Средние')).rejects.toThrow('Группа уже есть.');

    expect(result.current.groups).toEqual([FIRST, SECOND]);
  });
});
