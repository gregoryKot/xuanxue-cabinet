// Объявление ученикам на доске штата (ADR-0172, дополнение 2026-10-07):
// карточка-плюс, диалог правки, «Убрать» и истёкшее объявление. Рендерим
// через BoardScreen поверх настоящего useSettings — read-after-write
// (ADR-0087): доска показывает ответ PATCH, а не второй GET. Логика формы —
// useBoardNoticeForm.test.ts, состояния — boardNoticeState.test.ts.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { GRADING_QUEUE_PATH } from '../api/gradingPaths';
import { makeMe } from '../test-support/meFixture';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
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

// «Сегодня» доски — new Date() (StaffBoard.tsx): без фиксации «до 20 октября»
// истекло бы само, когда тест запустят позже.
const TODAY = new Date('2026-10-10T12:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});
afterEach(() => {
  vi.useRealTimers();
});

const NOTICE_TEXT = 'Ретрит в ноябре';
const ADD_NAME = /^Добавить объявление/;
const EDIT_NAME = 'Изменить объявление';
const DIALOG_NEW_TITLE = 'Объявление ученикам';
const SAVE_NAME = 'Сохранить';
const UNTIL_ERROR = 'Укажите, до какого дня показывать';

const SETTINGS_ACTIVE: SettingsDto = {
  ...SETTINGS_EMPTY,
  boardNotice: { text: NOTICE_TEXT, until: '2026-10-20' },
  updatedAt: '2026-10-06T10:10:00.000Z',
};

function mockBoard(settings: SettingsDto) {
  mockApiByPath({
    '/auth/me': makeMe({ id: 't1', name: 'Дима', roles: ['teacher'] }),
    '/auth/config': {},
    '/settings': settings,
    [GRADING_QUEUE_PATH]: [],
    ...NO_EVENTS_RESPONSES,
  });
}

async function renderBoard(settings: SettingsDto) {
  mockBoard(settings);
  renderBoardWithRoutes(null);
  await screen.findByRole('heading', { name: 'Настроить' });
  // Объявление рисуется, когда пришли настройки: ждём любое из его состояний.
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: ADD_NAME }) ??
        screen.queryByRole('button', { name: EDIT_NAME }),
    ).toBeInTheDocument(),
  );
}

function patchCalls() {
  return mockedApiFetch.mock.calls.filter(
    ([path, options]) => path === '/settings' && options?.method === 'PATCH',
  );
}

async function fillNotice(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Текст'), NOTICE_TEXT);
  fireEvent.change(screen.getByLabelText('Показывать до'), {
    target: { value: '2026-10-20' },
  });
}

describe('StaffBoardNotice — объявления нет', () => {
  it('карточка «Добавить объявление» есть, плашки «Объявление школы» нет', async () => {
    await renderBoard(SETTINGS_EMPTY);

    expect(screen.getByRole('button', { name: ADD_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Объявление школы' })).toBeNull();
    expect(screen.queryByRole('button', { name: EDIT_NAME })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('плюс открывает диалог «Объявление ученикам»: «Сохранить» неактивна, «Убрать» нет', async () => {
    const user = userEvent.setup();
    await renderBoard(SETTINGS_EMPTY);

    await user.click(screen.getByRole('button', { name: ADD_NAME }));

    const dialog = await screen.findByRole('dialog', { name: DIALOG_NEW_TITLE });
    expect(within(dialog).getByRole('button', { name: SAVE_NAME })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Убрать' })).toBeNull();
  });

  it('сохранение уходит одним PATCH, ответ сервера рисует плашку на доске, диалог закрыт', async () => {
    const user = userEvent.setup();
    await renderBoard(SETTINGS_EMPTY);
    await user.click(screen.getByRole('button', { name: ADD_NAME }));
    await screen.findByRole('dialog');
    await fillNotice(user);

    // Ответ PATCH — тот же путь, что и GET: перемокаем перед нажатием.
    mockBoard(SETTINGS_ACTIVE);
    await user.click(screen.getByRole('button', { name: SAVE_NAME }));

    const card = await screen.findByRole('complementary', { name: 'Объявление школы' });
    expect(card).toHaveTextContent(NOTICE_TEXT);
    expect(card).toHaveTextContent('До 20 октября');
    // Диалог закрывается через историю (useHistorySheet): не в тот же такт.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: ADD_NAME })).toBeNull();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: { boardNotice: { text: NOTICE_TEXT, until: '2026-10-20' } },
      }),
    );
    expect(patchCalls()).toHaveLength(1);
  });

  it('текст без даты — «Укажите, до какого дня показывать», запроса нет, диалог открыт', async () => {
    const user = userEvent.setup();
    await renderBoard(SETTINGS_EMPTY);
    await user.click(screen.getByRole('button', { name: ADD_NAME }));
    await user.type(await screen.findByLabelText('Текст'), NOTICE_TEXT);

    await user.click(screen.getByRole('button', { name: SAVE_NAME }));

    expect(await screen.findByRole('alert')).toHaveTextContent(UNTIL_ERROR);
    expect(patchCalls()).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('«Отмена» закрывает диалог без запроса', async () => {
    const user = userEvent.setup();
    await renderBoard(SETTINGS_EMPTY);
    await user.click(screen.getByRole('button', { name: ADD_NAME }));
    await user.type(await screen.findByLabelText('Текст'), NOTICE_TEXT);

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patchCalls()).toHaveLength(0);
    expect(screen.getByRole('button', { name: ADD_NAME })).toBeInTheDocument();
  });

  it('подсказка даты называет пояс школы жирным', async () => {
    const user = userEvent.setup();
    await renderBoard(SETTINGS_EMPTY);

    await user.click(screen.getByRole('button', { name: ADD_NAME }));

    // Пояс зрителя другой (stubViewerTimeZone), поэтому подсказка его называет.
    const tz = await screen.findByText('Asia/Jerusalem');
    expect(tz.tagName).toBe('STRONG');
  });
});

describe('StaffBoardNotice — объявление висит', () => {
  it('плашка «Объявление школы» и «Изменить объявление», карточки-плюса нет', async () => {
    await renderBoard(SETTINGS_ACTIVE);

    const card = screen.getByRole('complementary', { name: 'Объявление школы' });
    expect(card).toHaveTextContent(NOTICE_TEXT);
    expect(screen.getByRole('button', { name: EDIT_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ADD_NAME })).toBeNull();
  });

  it('«Изменить» открывает диалог с сохранёнными полями и кнопкой «Убрать»', async () => {
    const user = userEvent.setup();
    await renderBoard(SETTINGS_ACTIVE);

    await user.click(screen.getByRole('button', { name: EDIT_NAME }));

    const dialog = await screen.findByRole('dialog', { name: EDIT_NAME });
    expect(within(dialog).getByLabelText('Текст')).toHaveValue(NOTICE_TEXT);
    expect(within(dialog).getByLabelText('Показывать до')).toHaveValue('2026-10-20');
    expect(within(dialog).getByRole('button', { name: 'Убрать' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: SAVE_NAME })).toBeDisabled();
  });

  it('«Убрать» шлёт boardNotice: null, закрывает диалог, на доске снова «Добавить»', async () => {
    const user = userEvent.setup();
    await renderBoard(SETTINGS_ACTIVE);
    await user.click(screen.getByRole('button', { name: EDIT_NAME }));
    await screen.findByRole('dialog');

    mockBoard({ ...SETTINGS_EMPTY, updatedAt: '2026-10-06T10:20:00.000Z' });
    await user.click(screen.getByRole('button', { name: 'Убрать' }));

    expect(await screen.findByRole('button', { name: ADD_NAME })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('complementary', { name: 'Объявление школы' })).toBeNull();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({ method: 'PATCH', body: { boardNotice: null } }),
    );
    expect(patchCalls()).toHaveLength(1);
  });
});

describe('StaffBoardNotice — объявление истекло', () => {
  it('строка «Объявление снято» с текстом и датой, плашки нет, «Изменить» есть', async () => {
    await renderBoard({
      ...SETTINGS_EMPTY,
      boardNotice: { text: NOTICE_TEXT, until: '2026-10-01' },
    });

    expect(screen.getByText(/Объявление снято:/)).toHaveTextContent(
      `Объявление снято: «${NOTICE_TEXT}», До 1 октября`,
    );
    expect(screen.queryByRole('complementary', { name: 'Объявление школы' })).toBeNull();
    expect(screen.getByRole('button', { name: EDIT_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ADD_NAME })).toBeNull();
  });
});
