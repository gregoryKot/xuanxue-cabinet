// Подсказка в ленте «выберите свои занятия» (LessonScopeHint.tsx, ADR-0162,
// п. 5): кому она показывается, что в ней написано, и что делает «Оставить все».
// Лента вокруг неё — в NotificationsScreen.test.tsx; здесь одна карточка с тем,
// что ей отдаёт useLessonScope.ts.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type {
  LessonScopeClassDto,
  MeDto,
  MyLessonNotificationsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { LessonScopeHint } from './LessonScopeHint';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LESSONS_PATH = '/me/notifications/lessons';
const SCOPE_PATH = '/me/notifications/lessons/scope';
const REGION_NAME = 'О каких занятиях напоминать';
const HEADLINE_START = 'Напоминаем обо всех занятиях школы — ';

const STUDENT: MeDto = {
  id: 'u1',
  name: 'Мария Ли',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  email: 'maria@example.com',
  hasEmail: true,
  noTelegram: false,
  needsProfile: false,
  googleLinked: false,
};

const slot = (weekday: number) => ({ weekday, time: '19:00', durationMin: 60 });

const classWithSlots = (id: string, slotCount: number): LessonScopeClassDto => ({
  id,
  title: `Занятие ${id}`,
  groupLabel: '',
  tz: 'Asia/Jerusalem',
  slots: Array.from({ length: slotCount }, (_, index) => slot(index)),
});

const lessons = (
  scopeChosen: boolean,
  classes: LessonScopeClassDto[] = [classWithSlots('c1', 2), classWithSlots('c2', 1)],
  classIds: string[] = [],
): MyLessonNotificationsDto => ({
  scope: { mode: 'all', classIds },
  scopeChosen,
  classes,
  reminder: { minutes: null, schoolMinutes: 60 },
});

// Узкий путь раньше широкого: `mockApiByPath` берёт первое совпадение по
// префиксу, а `/me/notifications/lessons/scope` начинается с `/…/lessons`.
function serve(me: MeDto, response: unknown, putResponse: unknown = response) {
  mockApiByPath({ '/auth/me': me, [SCOPE_PATH]: putResponse, [LESSONS_PATH]: response });
}

function renderHint() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LessonScopeHint />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const lessonGets = () =>
  mockedApiFetch.mock.calls.filter(([path]) => path === LESSONS_PATH);
const putCalls = () => mockedApiFetch.mock.calls.filter(([path]) => path === SCOPE_PATH);
const findCard = () => screen.findByRole('complementary', { name: REGION_NAME });
const queryCard = () => screen.queryByRole('complementary', { name: REGION_NAME });

/** Ответ на `GET` занятий получен и разобран: без этого «карточки нет» верно
 * и пока запрос ещё в пути. */
async function waitForLessonsLoaded() {
  await waitFor(() => expect(lessonGets()).toHaveLength(1));
  await act(() => Promise.resolve());
}

describe('LessonScopeHint — кому показывается', () => {
  it('ученик, который ничего не выбирал: что приходит, как поменять и что нажать', async () => {
    serve(STUDENT, lessons(false));
    renderHint();

    const card = await findCard();

    expect(card).toHaveTextContent(`${HEADLINE_START}3 раза в неделю`);
    expect(screen.getByText('3 раза в неделю').tagName).toBe('STRONG');
    expect(card).toHaveTextContent('Отметьте свои — и лишнего не будет.');
    expect(screen.getByRole('link', { name: 'Выбрать занятия' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Оставить все' })).toBeEnabled();
  });

  it('число — слоты расписания всех занятий, с правильным склонением', async () => {
    serve(STUDENT, lessons(false, [classWithSlots('c1', 3), classWithSlots('c2', 2)]));
    renderHint();

    expect(await screen.findByText('5 раз в неделю')).toBeInTheDocument();
  });

  it('одно занятие в неделю — «1 раз»', async () => {
    serve(STUDENT, lessons(false, [classWithSlots('c1', 1)]));
    renderHint();

    expect(await screen.findByText('1 раз в неделю')).toBeInTheDocument();
  });

  it('«Выбрать занятия» — ссылка на настройки уведомлений', async () => {
    serve(STUDENT, lessons(false));
    renderHint();

    expect(await screen.findByRole('link', { name: 'Выбрать занятия' })).toHaveAttribute(
      'href',
      '/notifications/settings',
    );
  });

  it('человек уже выбирал (даже «все») — карточки нет', async () => {
    serve(STUDENT, lessons(true));
    renderHint();

    await waitForLessonsLoaded();
    expect(queryCard()).not.toBeInTheDocument();
  });

  it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
    'штат (%s) — карточки нет и за занятиями никто не ходит',
    async (role) => {
      serve({ ...STUDENT, roles: [role] }, lessons(false));
      renderHint();

      await waitFor(() =>
        expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me', expect.anything()),
      );
      await act(() => Promise.resolve());
      expect(queryCard()).not.toBeInTheDocument();
      expect(lessonGets()).toHaveLength(0);
    },
  );

  it('в расписании нет занятий — карточки нет: «0 раз в неделю» ничего не подсказывает', async () => {
    serve(STUDENT, lessons(false, []));
    renderHint();

    await waitForLessonsLoaded();
    expect(queryCard()).not.toBeInTheDocument();
  });

  it('занятия есть, а слотов в расписании нет — тоже карточки нет', async () => {
    serve(STUDENT, lessons(false, [classWithSlots('c1', 0)]));
    renderHint();

    await waitForLessonsLoaded();
    expect(queryCard()).not.toBeInTheDocument();
  });

  it('сбой загрузки — карточки нет и ошибки на экране нет: данные второстепенные', async () => {
    serve(STUDENT, new ApiError('Сервер не отвечает.', 500, 'unknown'));
    renderHint();

    await waitForLessonsLoaded();
    expect(queryCard()).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Сервер не отвечает/)).not.toBeInTheDocument();
  });

  it('пока данные в пути — ничего: ни карточки, ни скелетона', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === LESSONS_PATH) return new Promise(() => undefined);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const { container } = renderHint();

    await waitFor(() => expect(lessonGets()).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('LessonScopeHint — «Оставить все»', () => {
  it('шлёт PUT «все» с текущими галочками и прячет карточку по ответу, без второго GET', async () => {
    const user = userEvent.setup();
    serve(STUDENT, lessons(false, undefined, ['c1']), lessons(true, undefined, ['c1']));
    renderHint();

    await user.click(await screen.findByRole('button', { name: 'Оставить все' }));

    await waitFor(() => expect(queryCard()).not.toBeInTheDocument());
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        body: { mode: 'all', classIds: ['c1'] },
      }),
    );
    expect(lessonGets()).toHaveLength(1);
  });

  it('id занятия, которого нет в списке, в тело не попадает: сервер ответил бы 400 на всё', async () => {
    const user = userEvent.setup();
    serve(
      STUDENT,
      lessons(false, undefined, ['gone', 'c2']),
      lessons(true, undefined, ['c2']),
    );
    renderHint();

    await user.click(await screen.findByRole('button', { name: 'Оставить все' }));

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]?.[1]).toEqual(
      expect.objectContaining({ body: { mode: 'all', classIds: ['c2'] } }),
    );
  });

  it('пока PUT в пути, кнопка выключена, карточка на месте; ответ её убирает', async () => {
    const user = userEvent.setup();
    let finishPut: (value: unknown) => void = () => undefined;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === LESSONS_PATH) return Promise.resolve(lessons(false));
      if (path === SCOPE_PATH) {
        return new Promise((resolve) => {
          finishPut = resolve;
        });
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    renderHint();

    const keep = await screen.findByRole('button', { name: 'Оставить все' });
    await user.click(keep);

    await waitFor(() => expect(keep).toBeDisabled());
    expect(queryCard()).toBeInTheDocument();

    act(() => finishPut(lessons(true)));

    await waitFor(() => expect(queryCard()).not.toBeInTheDocument());
  });

  it('ответ с ошибкой — текст из ответа виден, карточка и кнопка остаются', async () => {
    const user = userEvent.setup();
    const message = 'Сервер занят. Попробуйте через минуту.';
    serve(STUDENT, lessons(false), new ApiError(message, 503, 'unknown'));
    renderHint();

    await user.click(await screen.findByRole('button', { name: 'Оставить все' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(queryCard()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Оставить все' })).toBeEnabled();
  });

  it('неопознанная ошибка — общий текст, не текст исключения', async () => {
    const user = userEvent.setup();
    serve(STUDENT, lessons(false), new Error('boom'));
    renderHint();

    await user.click(await screen.findByRole('button', { name: 'Оставить все' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
  });
});
