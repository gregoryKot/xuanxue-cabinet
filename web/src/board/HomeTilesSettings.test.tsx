// «Настроить главную» (ADR-0179): кнопка внизу главной, диалог с переключателями
// плиток своей роли, сохранение через `PUT /me/home-tiles` и перерисовка главной
// по ответу — без второго `GET /auth/me`. Сеть — mockApiByPath (ADR-0116); ответ PUT
// — тот `MeDto`, который вернул бы сервер.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto, MyLessonDto } from '@xuanxue/shared';
import { ApiError } from '../api/apiError';
import { AuthProvider } from '../auth/AuthProvider';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeMe, STAFF_ME } from '../test-support/meFixture';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { HomeTilesSettings } from './HomeTilesSettings';
import {
  NO_EVENTS_RESPONSES,
  renderBoardWithRoutes,
  SETTINGS_EMPTY,
} from './boardTestRender';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const OPEN_LABEL = 'Настроить главную';
const DIALOG_TITLE = 'Что показывать на главной';
const PAYMENT_HEADING = 'Оплата за октябрь 2026';
const LESSON: MyLessonDto = {
  id: 'l1',
  startsAt: '2030-09-08T16:00:00.000Z',
  durationMin: 60,
  classTitle: 'Тайцзицюань',
  groupLabel: '',
  format: 'online',
  topic: '',
  status: 'scheduled',
  tags: [],
};
const PAYMENTS = { month: '2026-10', rows: [], contact: 'Маше' };

const STUDENT = makeMe({ id: 's1', name: 'Мария' });

/** Всё, что может запросить любая из двух главных; `afterPut` — ответ сервера. */
function renderHome(me: MeDto, afterPut: MeDto | Error = me, lessons = [LESSON]) {
  mockApiByPath({
    '/auth/me': me,
    '/auth/config': {},
    '/me/home-tiles': afterPut,
    '/me/board': { notice: null },
    '/me/exams': [],
    '/me/payments': PAYMENTS,
    '/me/lessons': lessons,
    '/settings': SETTINGS_EMPTY,
    '/attempts/queue': [],
    ...NO_EVENTS_RESPONSES,
  });
  return renderBoardWithRoutes(<Route path="/grading" element={<p>Экран проверки</p>} />);
}

function callsTo(prefix: string) {
  return mockedApiFetch.mock.calls.filter(([path]) => path.startsWith(prefix));
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: OPEN_LABEL }));
  return screen.findByRole('dialog', { name: DIALOG_TITLE });
}

describe('«Настроить главную» — ученик', () => {
  it('кнопка стоит после последней плитки, а не над ней', async () => {
    renderHome(STUDENT);
    const payment = await screen.findByText(PAYMENT_HEADING);
    const button = await screen.findByRole('button', { name: OPEN_LABEL });

    expect(payment.compareDocumentPosition(button)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('диалог: пять плиток ученика, все включены, «Сохранить» ждёт правки', async () => {
    const user = userEvent.setup();
    renderHome(STUDENT);

    const dialog = await openDialog(user);

    const labels = within(dialog)
      .getAllByRole('checkbox')
      .map((box) => [(box as HTMLInputElement).labels?.[0]?.textContent, box]);
    expect(labels.map(([label]) => label)).toEqual([
      'Ближайшее занятие',
      'Объявление школы',
      'Экзамены к сдаче',
      'Оплата за месяц',
      'События школы',
    ]);
    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .every((box) => (box as HTMLInputElement).checked),
    ).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('«Отмена» закрывает диалог, ничего не отправляя', async () => {
    const user = userEvent.setup();
    renderHome(STUDENT);
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsTo('/me/home-tiles')).toHaveLength(0);
  });

  it('скрыл оплату: PUT с телом, диалог закрыт, плитка пропала, второго GET /auth/me нет', async () => {
    const user = userEvent.setup();
    renderHome(STUDENT, { ...STUDENT, homeHiddenTiles: ['payment'] });
    await screen.findByText(PAYMENT_HEADING);
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('checkbox', { name: 'Оплата за месяц' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/home-tiles', {
      method: 'PUT',
      body: { hidden: ['payment'] },
    });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(PAYMENT_HEADING)).not.toBeInTheDocument();
    expect(screen.getByText('Тайцзицюань')).toBeInTheDocument();
    expect(callsTo('/auth/me')).toHaveLength(1);
  });

  it('скрытое не запрашивается: оплата, занятия, объявление, события — ни одного GET', async () => {
    renderHome(
      makeMe({ homeHiddenTiles: ['payment', 'nextLesson', 'notice', 'events'] }),
    );
    await screen.findByRole('button', { name: OPEN_LABEL });
    // Запрос экзаменов уходит из эффекта и может не успеть к появлению кнопки:
    // сначала ждём его, иначе отсутствие остальных проверяется слишком рано.
    await waitFor(() => expect(callsTo('/me/exams')).toHaveLength(1));

    for (const path of ['/me/payments', '/me/lessons', '/me/board', '/me/events']) {
      expect(callsTo(path)).toHaveLength(0);
    }
  });

  it('вернул скрытую оплату: диалог показывает её выключенной, после сохранения плитка приходит с запросом', async () => {
    const user = userEvent.setup();
    const hidden = makeMe({ homeHiddenTiles: ['payment'] });
    renderHome(hidden, { ...hidden, homeHiddenTiles: [] });
    await screen.findByRole('button', { name: OPEN_LABEL });
    expect(callsTo('/me/payments')).toHaveLength(0);
    const dialog = await openDialog(user);
    const box = within(dialog).getByRole('checkbox', { name: 'Оплата за месяц' });
    expect(box).not.toBeChecked();

    await user.click(box);
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(PAYMENT_HEADING)).toBeInTheDocument();
    expect(callsTo('/me/payments')).toHaveLength(1);
  });

  it('сбой сохранения: текст ошибки в диалоге, диалог остаётся, главная прежняя', async () => {
    const user = userEvent.setup();
    renderHome(STUDENT, new ApiError('Сервис недоступен', 503, 'unknown'));
    await screen.findByText(PAYMENT_HEADING);
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('checkbox', { name: 'Оплата за месяц' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Сервис недоступен',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(PAYMENT_HEADING)).toBeInTheDocument();
  });

  it('скрыто всё: «ничего не ждут» и подсказка, как вернуть; кнопка на месте', async () => {
    renderHome(
      makeMe({ homeHiddenTiles: ['nextLesson', 'notice', 'exams', 'payment', 'events'] }),
    );

    expect(await screen.findByText('Сейчас от вас ничего не ждут.')).toBeInTheDocument();
    expect(
      screen.getByText(/можно вернуть через «Настроить главную»/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: OPEN_LABEL })).toBeInTheDocument();
  });

  it('ничего не скрывал и показывать нечего: подсказки про возврат нет', async () => {
    const inMode = makeMe({ studentMode: true, canUseStudentMode: true });
    renderHome(inMode, inMode, []);

    expect(await screen.findByText('Сейчас от вас ничего не ждут.')).toBeInTheDocument();
    expect(screen.queryByText(/можно вернуть/)).not.toBeInTheDocument();
  });
});

describe('«Настроить главную» — пока сессия не пришла', () => {
  it('кнопки нет: без профиля нечего настраивать', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    render(
      <AuthProvider>
        <HomeTilesSettings />
      </AuthProvider>,
    );

    expect(screen.queryByRole('button', { name: OPEN_LABEL })).not.toBeInTheDocument();
  });
});

describe('«Настроить главную» — штат', () => {
  it('диалог: объявление ученикам, проверка работ, события; входов в разделы нет', async () => {
    const user = userEvent.setup();
    renderHome(STAFF_ME);

    const dialog = await openDialog(user);

    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .map((box) => (box as HTMLInputElement).labels?.[0]?.textContent),
    ).toEqual(['Объявление ученикам', 'Проверка работ', 'События школы']);
  });

  it('скрыл проверку: тело PUT, плитки и очереди нет, входы в разделы на месте', async () => {
    const user = userEvent.setup();
    renderHome(STAFF_ME, { ...STAFF_ME, homeHiddenTiles: ['grading'] });
    await screen.findByRole('link', { name: /Проверка/ });
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('checkbox', { name: 'Проверка работ' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/home-tiles', {
      method: 'PUT',
      body: { hidden: ['grading'] },
    });
    await vi.waitFor(() =>
      expect(screen.queryByRole('link', { name: /Проверка/ })).not.toBeInTheDocument(),
    );
    for (const title of ['Занятия', 'Рассылки', 'Материалы', 'Школа']) {
      expect(screen.getByRole('link', { name: new RegExp(title) })).toBeInTheDocument();
    }
  });

  it('скрыты все три плитки: ни настроек, ни очереди, ни событий не запрашивается; входы стоят', async () => {
    renderHome({ ...STAFF_ME, homeHiddenTiles: ['notice', 'grading', 'events'] });
    await screen.findByRole('link', { name: /Занятия/ });

    for (const path of ['/settings', '/attempts/queue', '/events']) {
      expect(callsTo(path)).toHaveLength(0);
    }
    expect(screen.getByRole('button', { name: OPEN_LABEL })).toBeInTheDocument();
  });

  it('штат в режиме ученика правит ключи ученика и не стирает скрытое как штат', async () => {
    const user = userEvent.setup();
    const inMode = {
      ...STAFF_ME,
      roles: [],
      studentMode: true,
      homeHiddenTiles: ['grading' as const],
    };
    renderHome(inMode);
    const dialog = await openDialog(user);
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(5);

    await user.click(within(dialog).getByRole('checkbox', { name: 'Оплата за месяц' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/home-tiles', {
      method: 'PUT',
      body: { hidden: ['payment', 'grading'] },
    });
  });
});
