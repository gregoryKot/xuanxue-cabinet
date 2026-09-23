// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts» — компонент никогда
// не видит fetch напрямую, подменяем именно эту точку). Занятие открывается
// своей страницей (ClassEditorScreen.tsx, ADR-0033) — вместо неё в маршрутах
// стоит метка: здесь проверяется переход по адресу, сама страница — в своём
// тесте.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import ScheduleScreen from './ScheduleScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань, средняя группа',
    groupLabel: '',
    format: 'online',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_MARKER = 'Здесь страница нового занятия';
const EDITOR_MARKER = 'Здесь страница занятия расписания';

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/schedule']}>
      <Routes>
        <Route path="/schedule" element={<ScheduleScreen />} />
        <Route path="/schedule/new" element={<p>{NEW_MARKER}</p>} />
        <Route path="/schedule/:classId" element={<p>{EDITOR_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Подпись «время в сетке — по часам школы» видит только зритель из другого
// пояса, поэтому пояс зрителя задан явно, а не взят из окружения
// (test-support/viewerTimeZone.ts).
stubViewerTimeZone();

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('ScheduleScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Обновить», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    const retry = screen.getByRole('button', { name: 'Обновить' });

    mockedApiFetch.mockResolvedValueOnce([makeClass()]);
    await user.click(retry);

    expect(await screen.findByText(/19:00–20:00/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ScheduleScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = renderScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('ScheduleScreen — пустая база', () => {
  it('заголовок раздела, объяснение и кнопка «Добавить занятие»', async () => {
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByText(/Пока в расписании нет занятий/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Расписание' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Постоянные занятия недели/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить занятие' })).toBeInTheDocument();
  });
});

describe('ScheduleScreen — список занятий (десктоп, сетка семи колонок)', () => {
  it('рендерит карточку слота в колонке своего дня, все 7 подписей дней видны', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();

    expect(await screen.findByText(/19:00–20:00/)).toBeInTheDocument();
    expect(screen.getAllByText(/^(Вс|Пн|Вт|Ср|Чт|Пт|Сб)$/)).toHaveLength(7);
    // Шесть пустых дней подписаны словами, а не оставлены пустым столбцом
    // (макет Schedule.dc.html).
    expect(screen.getAllByText('Занятий нет')).toHaveLength(6);
  });
});

describe('ScheduleScreen — список занятий (мобильный, ревью п.15)', () => {
  it('<768px — вертикальный список, пустые дни скрыты (не 7 подписей)', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    );
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();

    expect(await screen.findByText(/19:00–20:00/)).toBeInTheDocument();
    expect(screen.getAllByText(/^(Вс|Пн|Вт|Ср|Чт|Пт|Сб)$/)).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});

describe('ScheduleScreen — переход на страницу занятия', () => {
  it('карточка слота ведёт на `/schedule/:classId`', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();
    await user.click(await screen.findByText(/19:00–20:00/));

    expect(await screen.findByText(EDITOR_MARKER)).toBeInTheDocument();
  });

  it('«Добавить занятие» ведёт на `/schedule/new`', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Добавить занятие' }));

    expect(await screen.findByText(NEW_MARKER)).toBeInTheDocument();
  });
});

describe('ScheduleScreen — пояс и ссылки (отзыв владельца 2026-09-12)', () => {
  it('два занятия в поясе школы — подпись про часы школы одна на экран', async () => {
    mockedApiFetch.mockResolvedValue([
      makeClass(),
      makeClass({
        id: 'c2',
        rules: [{ id: 'r2', weekday: 4, time: '08:00', durationMin: 60 }],
      }),
    ]);

    renderScreen();

    // Пояс выделен акцентом — RichText рисует его через <strong>, полный
    // текст строки сверяем по textContent абзаца (ADR-0124).
    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent === 'Время в сетке — по часам школы (Asia/Jerusalem).',
      ),
    ).toBeInTheDocument();
    const zoneMatches = screen.getAllByText(/Asia\/Jerusalem/);
    expect(zoneMatches).toHaveLength(1);
    expect(zoneMatches[0]?.tagName).toBe('STRONG');
  });

  it('онлайн-занятие без ссылки Zoom — «без ссылки» на карточке слота', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();

    expect(await screen.findByText('без ссылки')).toBeInTheDocument();
  });

  it('ссылка заполнена — пометки нет', async () => {
    mockedApiFetch.mockResolvedValue([
      makeClass({ zoomLink: 'https://us02web.zoom.us/j/1' }),
    ]);

    renderScreen();

    await screen.findByText(/19:00–20:00/);
    expect(screen.queryByText('без ссылки')).not.toBeInTheDocument();
  });
});
