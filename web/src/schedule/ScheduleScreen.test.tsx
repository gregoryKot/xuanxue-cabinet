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
    groupIds: [],
    format: 'online',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
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
    target: '@xuanxue',
    groupIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_MARKER = 'Здесь страница нового занятия';
const CHANNELS_MARKER = 'Здесь каналы';
const TEMPLATES_MARKER = 'Здесь шаблоны';
const JOURNAL_MARKER = 'Здесь журнал отправок';
const EDITOR_MARKER = 'Здесь страница занятия расписания';

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/schedule']}>
      <Routes>
        <Route path="/schedule" element={<ScheduleScreen />} />
        <Route path="/schedule/new" element={<p>{NEW_MARKER}</p>} />
        <Route path="/channels" element={<p>{CHANNELS_MARKER}</p>} />
        <Route path="/templates" element={<p>{TEMPLATES_MARKER}</p>} />
        <Route path="/broadcasts" element={<p>{JOURNAL_MARKER}</p>} />
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
      screen.getByRole('heading', { level: 1, name: 'Расписание и рассылки' }),
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

// Под занятием стоит «куда оно уходит» (ADR-0191, ADR-0195, ADR-0196): каналы его
// групп; считаются только АКТИВНЫЕ каналы кабинета (экран грузит их отдельным
// запросом), названия групп — из списка групп.
const SCHEDULE_GROUPS = [
  { id: 'g1', name: 'Средние' },
  { id: 'g2', name: 'Старшие' },
];

describe('ScheduleScreen — куда уходит занятие (ADR-0196)', () => {
  it('у занятия две группы — по группе «название · каналы», чужие не попадают', async () => {
    mockApiByPath({
      '/classes': [makeClass({ groupIds: ['g1', 'g2'], groupLabel: 'Средние, Старшие' })],
      '/groups': SCHEDULE_GROUPS,
      '/channels': [
        makeChannel({ id: 'ch1', title: 'Тайцзи онлайн', groupIds: ['g1'] }),
        makeChannel({ id: 'ch2', title: 'Вечерняя группа', groupIds: ['g2'] }),
        makeChannel({ id: 'ch3', title: 'Чужой', groupIds: ['g3'] }),
      ],
    });

    renderScreen();

    expect(
      await screen.findByText('→ Средние · Тайцзи онлайн, Старшие · Вечерняя группа'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/никуда не уходит/)).not.toBeInTheDocument();
  });

  it('у одной из групп нет канала — стрелка по остальным и красная строка про эту', async () => {
    mockApiByPath({
      '/classes': [makeClass({ groupIds: ['g1', 'g2'], groupLabel: 'Средние, Старшие' })],
      '/groups': SCHEDULE_GROUPS,
      '/channels': [makeChannel({ id: 'ch1', title: 'Тайцзи онлайн', groupIds: ['g1'] })],
    });

    renderScreen();

    expect(await screen.findByText('→ Средние · Тайцзи онлайн')).toBeInTheDocument();
    expect(screen.getByText('У группы «Старшие» нет канала — туда не уйдёт')).toHaveStyle(
      {
        color: 'var(--danger)',
      },
    );
  });

  it('ни у одной группы нет канала — красное «Ни у одной группы занятия нет канала»', async () => {
    mockApiByPath({
      '/classes': [makeClass({ groupIds: ['g1', 'g2'], groupLabel: 'Средние, Старшие' })],
      '/groups': SCHEDULE_GROUPS,
      '/channels': [makeChannel({ id: 'ch3', title: 'Без группы', groupIds: [] })],
    });

    renderScreen();

    expect(
      await screen.findByText('Ни у одной группы занятия нет канала — никуда не уходит'),
    ).toBeInTheDocument();
  });

  it('занятие без группы — красное «Без группы — никуда не уходит»', async () => {
    mockApiByPath({
      '/classes': [makeClass()],
      '/groups': SCHEDULE_GROUPS,
      '/channels': [makeChannel({ groupIds: ['g1'] })],
    });

    renderScreen();

    expect(await screen.findByText('Без группы — никуда не уходит')).toBeInTheDocument();
  });

  it('у группы нет канала — предупреждение называет группу', async () => {
    mockApiByPath({
      '/classes': [makeClass({ groupIds: ['g1'], groupLabel: 'Средние' })],
      '/groups': SCHEDULE_GROUPS,
      '/channels': [],
    });

    renderScreen();

    expect(
      await screen.findByText('У группы «Средние» нет канала — никуда не уходит'),
    ).toBeInTheDocument();
  });

  it('выключенное занятие без группы — без предупреждения', async () => {
    mockApiByPath({ '/classes': [makeClass({ active: false })], '/channels': [] });

    renderScreen();

    await screen.findByText('выключено');
    expect(screen.queryByText(/никуда не уходит/)).not.toBeInTheDocument();
  });

  it('каналы ещё грузятся — строки нет, ложного предупреждения тоже', async () => {
    mockApiByPath({ '/classes': [makeClass()], '/channels': new Promise(() => {}) });

    renderScreen();

    await screen.findByText('19:00');
    expect(screen.queryByText(/никуда не уходит|→/)).not.toBeInTheDocument();
  });
});

describe('ScheduleScreen — вход в подэкраны раздела (ADR-0191)', () => {
  it('в шапке «Каналы», «Шаблоны», «Журнал отправок» и главная «Добавить занятие»', async () => {
    mockApiByPath({ '/classes': [], '/channels': [] });

    renderScreen();
    await screen.findByRole('button', { name: 'Добавить занятие' });

    const heading = screen.getByRole('heading', { level: 1 });
    const labels = within(heading.parentElement?.parentElement as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toEqual(['Каналы', 'Шаблоны', 'Журнал отправок', 'Добавить занятие']);
  });

  it('входы видны, пока занятия грузятся; «Добавить занятие» — после', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    renderScreen();

    for (const name of ['Каналы', 'Шаблоны', 'Журнал отправок']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Добавить занятие' })).toBeNull();
  });

  it.each([
    ['Каналы', CHANNELS_MARKER],
    ['Шаблоны', TEMPLATES_MARKER],
    ['Журнал отправок', JOURNAL_MARKER],
  ])('«%s» ведёт на свой экран', async (name, marker) => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': [], '/channels': [] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name }));

    expect(screen.getByText(marker)).toBeInTheDocument();
  });
});
