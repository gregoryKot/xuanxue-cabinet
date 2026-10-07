// Рубрика «События» на доске ученика (ADR-0177): события показаны с датами по
// часам зрителя, нет событий — нет и рубрики, сбой — баннер с повтором.
// Прошедших сервер ученику не отдаёт (api/test/school-events.e2e-spec.ts), тут
// проверяем только отрисовку того, что пришло. Сеть — mockApiByPath (ADR-0116).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { BoardEvents } from './BoardEvents';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
// Зритель в Иерусалиме: 08:00 UTC ноября — 10:00 на его часах.
stubViewerTimeZone('Asia/Jerusalem');

function renderEvents() {
  return render(
    <MemoryRouter>
      <BoardEvents />
    </MemoryRouter>,
  );
}

/** Карточка события по названию: `article`, в котором стоит его заголовок. */
function cardNamed(title: string) {
  const card = screen.getByRole('heading', { name: title }).closest('article');
  if (!card) throw new Error(`нет карточки «${title}»`);
  return within(card);
}

function callsTo(path: string) {
  return mockedApiFetch.mock.calls.filter(([p]) => p === path);
}

describe('BoardEvents — есть события', () => {
  it('рубрика «События»: название, даты, место и подробности', async () => {
    mockApiByPath({
      '/me/events': [
        makeSchoolEvent({
          id: 'retreat',
          title: 'Ретрит в Галилее',
          startsAt: '2030-11-14T08:00:00.000Z',
          endsAt: '2030-11-16T15:00:00.000Z',
          place: 'Кибуц Амиад',
          description: 'Стоимость **1200 ₪**, пишите @marievyazova',
        }),
        makeSchoolEvent({
          id: 'seminar',
          title: 'Семинар по тайцзи',
          startsAt: '2030-12-05T15:00:00.000Z',
        }),
      ],
    });
    renderEvents();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'События' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);

    const retreat = cardNamed('Ретрит в Галилее');
    expect(
      retreat.getByRole('heading', { name: 'Ретрит в Галилее' }),
    ).toBeInTheDocument();
    expect(retreat.getByText('14–16 ноября')).toBeInTheDocument();
    expect(retreat.getByText('Кибуц Амиад')).toBeInTheDocument();
    expect(retreat.getByText('1200 ₪').tagName).toBe('STRONG');
    expect(retreat.getByRole('link', { name: '@marievyazova' })).toHaveAttribute(
      'href',
      'https://t.me/marievyazova',
    );

    // Одна дата с часом, без места и подробностей — только нужное.
    const seminar = cardNamed('Семинар по тайцзи');
    expect(seminar.getByText('Чт, 5 декабря, 17:00')).toBeInTheDocument();
    expect(seminar.queryByText('Кибуц Амиад')).toBeNull();
  });

  it('карточка читается, а не ведёт на правку: ссылок на /events нет', async () => {
    mockApiByPath({ '/me/events': [makeSchoolEvent()] });
    renderEvents();

    await screen.findByRole('article');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('BoardEvents — нет событий', () => {
  it('пустой ответ — рубрики нет вовсе', async () => {
    mockApiByPath({ '/me/events': [] });
    const { container } = renderEvents();

    await vi.waitFor(() => expect(callsTo('/me/events')).toHaveLength(1));
    expect(screen.queryByRole('heading', { name: 'События' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BoardEvents — сбой', () => {
  it('баннер с «Обновить»; повтор перечитывает события и показывает рубрику', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/me/events': new TypeError('Failed to fetch') });
    renderEvents();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить события школы. Попробуйте ещё раз.',
    );
    expect(screen.queryByRole('heading', { name: 'События' })).toBeNull();
    expect(callsTo('/me/events')).toHaveLength(1);

    mockApiByPath({ '/me/events': [makeSchoolEvent()] });
    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    expect(await screen.findByRole('heading', { name: 'События' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
