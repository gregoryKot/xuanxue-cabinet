// Отдельный файл от PlanningScreen.test.tsx: там apiFetch замокан целиком
// (vi.mock('../api/http')), а здесь нужен настоящий apiFetch — только через
// него сработает prefetchCache.ts (takePrefetched внутри http.ts). Мокнут
// только global fetch, и он не должен вызываться вовсе, если экран
// действительно взял данные из кэша, а не переспросил их у сети.
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSES_LIST_PATH,
  LESSON_RECORDING_SUMMARY_PATH,
  lessonsListPath,
} from '../api/apiPaths';
import { putPrefetched } from '../api/prefetchCache';
import { makeClass, makeLesson } from '../test-support/planningFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import PlanningScreen from './PlanningScreen';

stubViewerTimeZone();

// Часы фиксированы по той же причине, что в PlanningScreen.test.tsx: список
// отбрасывает дни раньше сегодняшнего (upcomingDayGroups.ts), и с настоящими
// часами занятие фикстуры давно бы из него выпало. Момент тот же, и ключ
// предзагрузки (lessonsListPath → planningWindow) совпадает с ключом хука.
const NOW = new Date('2026-09-07T06:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/planning']}>
      <PlanningScreen />
    </MemoryRouter>,
  );
}

describe('PlanningScreen — данные из prefetchCache', () => {
  it('кэш прогрет предзагрузкой — экран берёт готовые промисы, в сеть не ходит', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('сеть не должна вызываться'));
    vi.stubGlobal('fetch', fetchMock);
    const lesson = makeLesson({ topic: 'Пятое занятие цикла' });
    const cls = makeClass();
    putPrefetched(lessonsListPath(), Promise.resolve([lesson]));
    putPrefetched(CLASSES_LIST_PATH, Promise.resolve([cls]));
    putPrefetched(
      LESSON_RECORDING_SUMMARY_PATH,
      Promise.resolve({ periodDays: 30, lessonsPast: 0, lessonsWithRecording: 0 }),
    );

    renderScreen();

    // Внутри списка дней: то же занятие показано ещё и крупной карточкой
    // «Сегодня» (TodaySection.tsx), и запрос по всему экрану нашёл бы два.
    const dayList = within(await screen.findByRole('list'));
    expect(dayList.getByText(/Пятое занятие цикла/)).toBeInTheDocument();
    expect(dayList.getByText(/Тайцзицюань, средняя группа/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('кэш пуст — экран идёт в сеть, как обычно (предзагрузка не обязательна)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const body = url.startsWith('/api/lessons') ? [makeLesson()] : [makeClass()];
      return Promise.resolve({
        ok: true,
        status: 200,
        // http.ts читает заголовок версии сборки на каждом ответе (ADR-0101).
        headers: { get: () => null },
        json: () => Promise.resolve(body),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderScreen();

    const dayList = within(await screen.findByRole('list'));
    expect(dayList.getByText(/Тайцзицюань, средняя группа/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
