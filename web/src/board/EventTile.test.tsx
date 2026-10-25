// Плитка события (ADR-0177, ADR-0178): ученику — название, даты по часам
// зрителя, место и подробности без ссылки на правку; штату — плитка-ссылка
// на страницу правки без подробностей. Сеть не нужна — плитка получает
// событие готовым.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { EventTile } from './EventTile';

// Зритель в Иерусалиме: 08:00 UTC ноября — 10:00 на его часах.
stubViewerTimeZone('Asia/Jerusalem');

const RETREAT = makeSchoolEvent({
  id: 'retreat',
  title: 'Ретрит в Галилее',
  startsAt: '2030-11-14T08:00:00.000Z',
  endsAt: '2030-11-16T15:00:00.000Z',
  place: 'Кибуц Амиад',
  description: 'Стоимость **1200 ₪**, пишите @marievyazova',
});

function renderTile(editable: boolean, event = RETREAT) {
  return render(
    <MemoryRouter>
      <EventTile event={event} editable={editable} />
    </MemoryRouter>,
  );
}

describe('EventTile — ученик', () => {
  it('название заголовком плитки, даты, место и подробности с акцентом и ником', () => {
    renderTile(false);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Ретрит в Галилее' }),
    ).toBeInTheDocument();
    expect(screen.getByText('14–16 ноября')).toBeInTheDocument();
    expect(screen.getByText('Кибуц Амиад')).toBeInTheDocument();
    expect(screen.getByText('1200 ₪').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: '@marievyazova' })).toHaveAttribute(
      'href',
      'https://t.me/marievyazova',
    );
  });

  it('читается, а не ведёт на правку: ссылок на /events нет', () => {
    renderTile(false, makeSchoolEvent({ description: 'Без ников' }));

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('одна дата с часом, без места и подробностей — только нужное', () => {
    renderTile(
      false,
      makeSchoolEvent({
        title: 'Семинар по тайцзи',
        startsAt: '2030-12-05T15:00:00.000Z',
      }),
    );

    expect(screen.getByText('Чт, 5 декабря, 17:00')).toBeInTheDocument();
    expect(screen.queryByText('Кибуц Амиад')).toBeNull();
  });
});

describe('EventTile — штат', () => {
  it('плитка целиком ведёт на страницу правки, подробности скрыты', () => {
    renderTile(true);

    expect(screen.getByRole('link', { name: /Ретрит в Галилее/ })).toHaveAttribute(
      'href',
      '/events/retreat',
    );
    expect(screen.queryByText(/Стоимость/)).toBeNull();
  });
});
