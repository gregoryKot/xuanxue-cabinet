// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts» — компонент никогда
// не видит fetch напрямую, подменяем именно эту точку). Занятие открывается
// своей страницей (ClassEditorScreen.tsx, ADR-0033) — вместо неё в маршрутах
// стоит метка: здесь проверяется переход по адресу, сама страница — в своём
// тесте.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelDto, ClassDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { mockApiByPath } from '../test-support/apiFetchMock';
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

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'telegram',
    title: 'Канал школы',
    active: true,
    target: '@xuanxue',
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

// Подпись «время в расписании — по часам школы» видит только зритель из другого
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

    expect(await screen.findByText('19:00')).toBeInTheDocument();
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

describe('ScheduleScreen — неделя днями', () => {
  it('занятие — строкой в карточке своего дня, пустые дни не показаны', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();

    const tuesday = await screen.findByRole('region', { name: 'Вторник' });
    expect(within(tuesday).getByText('19:00')).toBeInTheDocument();
    expect(within(tuesday).getByText('20:00')).toBeInTheDocument();
    // Один день с занятием — один заголовок дня; шести пустых нет, и «Занятий
    // нет» семь раз подряд тоже.
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.queryByText('Занятий нет')).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Вс|Пн|Вт|Ср|Чт|Пт|Сб)$/)).not.toBeInTheDocument();
  });

  it('занятия разных дней — по карточке на день, от воскресенья к субботе', async () => {
    mockedApiFetch.mockResolvedValue([
      makeClass({
        rules: [
          { id: 'r1', weekday: 6, time: '10:00', durationMin: 60 },
          { id: 'r2', weekday: 0, time: '09:00', durationMin: 60 },
          { id: 'r3', weekday: 2, time: '19:00', durationMin: 60 },
        ],
      }),
    ]);

    renderScreen();

    await screen.findByRole('region', { name: 'Суббота' });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Воскресенье', 'Вторник', 'Суббота']);
  });

  it('адрес занятия из списка доходит до строки', async () => {
    mockedApiFetch.mockResolvedValue([
      makeClass({ format: 'offline', location: 'Парк Яркон, у входа' }),
    ]);

    renderScreen();

    expect(await screen.findByText('Парк Яркон, у входа')).toBeInTheDocument();
  });
});

// Раскладка одна на все ширины: раньше на мониторе была сетка семи колонок, на
// телефоне — список (useIsMobile, ревью п.15), и каждая ветка прятала свои
// поломки. Ширину теперь делит CSS (columns), а не JS: экран не спрашивает
// matchMedia, поэтому тест на «телефон» и «монитор» видит одно и то же.
describe('ScheduleScreen — одна раскладка на любой ширине', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([true, false])(
    'matchMedia(max-width) = %s — тот же список дней',
    async (matches) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      );
      mockedApiFetch.mockResolvedValue([makeClass()]);

      renderScreen();

      expect(await screen.findByRole('region', { name: 'Вторник' })).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    },
  );
});

describe('ScheduleScreen — переход на страницу занятия', () => {
  it('строка занятия ведёт на `/schedule/:classId`', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();
    await user.click(await screen.findByRole('button', { name: /Тайцзицюань/ }));

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
          el.textContent === 'Время в расписании — по часам школы (Asia/Jerusalem).',
      ),
    ).toBeInTheDocument();
    const zoneMatches = screen.getAllByText(/Asia\/Jerusalem/);
    expect(zoneMatches).toHaveLength(1);
    expect(zoneMatches[0]?.tagName).toBe('STRONG');
  });

  it('онлайн-занятие без ссылки Zoom — «без ссылки» в строке занятия', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();

    expect(await screen.findByText('без ссылки')).toBeInTheDocument();
  });

  it('ссылка заполнена — пометки нет', async () => {
    mockedApiFetch.mockResolvedValue([
      makeClass({ zoomLink: 'https://us02web.zoom.us/j/1' }),
    ]);

    renderScreen();

    await screen.findByText('19:00');
    expect(screen.queryByText('без ссылки')).not.toBeInTheDocument();
  });
});

// Пометка «без каналов» считает только АКТИВНЫЕ каналы кабинета (ревью п.4):
// экран грузит их отдельным запросом, и без него выключенный канал в channelIds
// занятия гасил бы пометку.
describe('ScheduleScreen — каналы рассылки (ревью п.4)', () => {
  it('онлайн без активных каналов — «без каналов»', async () => {
    mockApiByPath({ '/classes': [makeClass({ channelIds: ['gone'] })], '/channels': [] });

    renderScreen();

    expect(await screen.findByText('без каналов')).toBeInTheDocument();
  });

  it('у занятия есть активный канал — пометки нет, числа каналов тоже', async () => {
    mockApiByPath({
      '/classes': [makeClass({ channelIds: ['ch1'] })],
      '/channels': [makeChannel({ id: 'ch1' })],
    });

    renderScreen();

    await screen.findByText('19:00');
    expect(screen.queryByText('без каналов')).not.toBeInTheDocument();
    expect(screen.queryByText(/1 канал/)).not.toBeInTheDocument();
  });
});
