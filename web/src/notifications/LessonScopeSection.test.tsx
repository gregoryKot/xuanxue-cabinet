// Блок «О каких занятиях» (LessonScopeSection.tsx, ADR-0162): выбор «обо всех» /
// «только о выбранных» и галочки занятий. Запись — PUT с выбором целиком, экран
// рисуется из его ответа (read-after-write без второго GET, ADR-0087).
// Пояс зрителя задан явно (CLAUDE.md «Детерминизм»): по умолчанию — пояс школы,
// чтобы подпись пояса не зависела от машины, на которой идёт тест.
import { render, screen, waitFor, within } from '@testing-library/react';
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
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { LessonScopeSection } from './LessonScopeSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone('Asia/Jerusalem');

const SCOPE_PATH = '/me/notifications/lessons/scope';
const LESSONS_PATH = '/me/notifications/lessons';

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

const slot = (weekday: number, time: string) => ({ weekday, time, durationMin: 60 });

const MORNING: LessonScopeClassDto = {
  id: 'c1',
  title: 'Тайцзи для начинающих',
  groupLabel: 'утро',
  tz: 'Asia/Jerusalem',
  slots: [slot(1, '10:00'), slot(2, '10:00')],
};
const EVENING: LessonScopeClassDto = {
  id: 'c2',
  title: 'Цигун',
  groupLabel: '',
  tz: 'Asia/Jerusalem',
  slots: [slot(3, '19:00')],
};

const lessons = (
  mode: 'all' | 'selected',
  classIds: string[],
  classes: LessonScopeClassDto[] = [MORNING, EVENING],
): MyLessonNotificationsDto => ({
  scope: { mode, classIds },
  classes,
  reminder: { minutes: null, schoolMinutes: 60 },
});

function serve(me: MeDto, response: unknown, putResponse: unknown = response) {
  // Узкий путь раньше широкого: `mockApiByPath` берёт первое совпадение по
  // префиксу, а `/me/notifications/lessons/scope` начинается с `/…/lessons`.
  mockApiByPath({
    '/auth/me': me,
    [SCOPE_PATH]: putResponse,
    [LESSONS_PATH]: response,
  });
}

function renderSection() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LessonScopeSection />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function putCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path === SCOPE_PATH);
}

describe('LessonScopeSection — кому показывается', () => {
  it('ученику — заголовок, объяснение с акцентом и оба режима; по умолчанию «обо всех»', async () => {
    serve(STUDENT, lessons('all', []));
    renderSection();

    // Радио появляются после загрузки — до неё на месте блока скелетон.
    expect(
      await screen.findByRole('radio', { name: 'Обо всех занятиях школы' }),
    ).toBeChecked();
    expect(screen.getByRole('heading', { name: 'О каких занятиях' })).toBeVisible();
    expect(screen.getByText(/Отметьте занятия, на которые ходите/)).toHaveTextContent(
      'Отметьте занятия, на которые ходите, — напоминания будут приходить только о них.',
    );
    expect(screen.getByText('только о них').tagName).toBe('STRONG');
    expect(screen.getByRole('radio', { name: 'Только о выбранных' })).not.toBeChecked();
    // Список занятий нужен только в режиме «выбранные».
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
    'штат (%s) — блока нет и за занятиями никто не ходит',
    async (role) => {
      serve({ ...STUDENT, roles: [role] }, lessons('all', []));
      renderSection();

      await waitFor(() =>
        expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me', expect.anything()),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: 'О каких занятиях' }),
        ).not.toBeInTheDocument(),
      );
      expect(mockedApiFetch).not.toHaveBeenCalledWith(LESSONS_PATH, expect.anything());
    },
  );
});

describe('LessonScopeSection — список занятий', () => {
  it('«выбранные» — занятия из ответа: название, группа, дни и время, отмеченные стоят', async () => {
    serve(STUDENT, lessons('selected', ['c1']));
    renderSection();

    const morning = await screen.findByRole('checkbox', {
      name: 'Тайцзи для начинающих · утро',
    });
    expect(morning).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Цигун' })).not.toBeChecked();
    expect(screen.getByText('пн, вт · 10:00')).toBeInTheDocument();
    expect(screen.getByText('ср · 19:00')).toBeInTheDocument();
    // Пояс школы совпал с поясом зрителя — подписывать нечего.
    expect(screen.queryByText(/по часам школы/)).not.toBeInTheDocument();
  });

  it('вёрстка списка — один общий список, строки не слипаются (ADR-0088)', async () => {
    serve(STUDENT, lessons('selected', ['c1']));
    renderSection();

    const list = (await screen.findAllByRole('list'))[0];
    expect(list).toBeDefined();
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('в расписании нет занятий — честная строка вместо пустого списка', async () => {
    serve(STUDENT, lessons('selected', [], []));
    renderSection();

    expect(await screen.findByText('В расписании пока нет занятий.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('«выбранные» без галочек — строка «ни о каких»', async () => {
    serve(STUDENT, lessons('selected', []));
    renderSection();

    expect(
      await screen.findByText('Ничего не отмечено — уведомлений о занятиях не будет.'),
    ).toBeInTheDocument();
  });

  it('есть хоть одна галочка — строки «ни о каких» нет', async () => {
    serve(STUDENT, lessons('selected', ['c2']));
    renderSection();

    await screen.findByRole('checkbox', { name: 'Цигун' });
    expect(screen.queryByText(/Ничего не отмечено/)).not.toBeInTheDocument();
  });

  it('в выборе остался id удалённого занятия — строка «ни о каких» всё равно есть', async () => {
    serve(STUDENT, lessons('selected', ['gone']));
    renderSection();

    expect(await screen.findByText(/Ничего не отмечено/)).toBeInTheDocument();
  });
});

describe('LessonScopeSection — пояс школы', () => {
  stubViewerTimeZone('Australia/Sydney');

  it('зритель в другом поясе — время остаётся школьным, пояс школы назван один раз над списком', async () => {
    // Правило повторяется каждую неделю и хранится в поясе школы; «Расписание»
    // штата показывает его так же. Пересчёта на часы зрителя нет.
    serve(STUDENT, lessons('selected', []));
    renderSection();

    await screen.findByRole('checkbox', { name: 'Цигун' });
    expect(screen.getByText('пн, вт · 10:00')).toBeInTheDocument();
    expect(screen.getByText('ср · 19:00')).toBeInTheDocument();
    expect(screen.getAllByText(/Время — по часам школы/)).toHaveLength(1);
    expect(screen.getByText('Asia/Jerusalem').tagName).toBe('STRONG');
  });
});

describe('LessonScopeSection — запись выбора', () => {
  it('«Только о выбранных» шлёт PUT с режимом и прежними галочками и берёт состояние из ответа', async () => {
    const user = userEvent.setup();
    serve(STUDENT, lessons('all', ['c1']), lessons('selected', ['c1']));
    renderSection();

    await user.click(await screen.findByRole('radio', { name: 'Только о выбранных' }));

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Только о выбранных' })).toBeChecked(),
    );
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        body: { mode: 'selected', classIds: ['c1'] },
      }),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Тайцзи для начинающих · утро' }),
    ).toBeChecked();
    // Второго GET за тем же самым нет (ADR-0087).
    const lessonGets = mockedApiFetch.mock.calls.filter(
      ([path]) => path === LESSONS_PATH,
    );
    expect(lessonGets).toHaveLength(1);
  });

  it('возврат к «Обо всех» оставляет галочки в теле: вернулся к выбранным — они на месте', async () => {
    const user = userEvent.setup();
    serve(STUDENT, lessons('selected', ['c2']), lessons('all', ['c2']));
    renderSection();

    await user.click(
      await screen.findByRole('radio', { name: 'Обо всех занятиях школы' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Обо всех занятиях школы' }),
      ).toBeChecked(),
    );
    expect(putCalls()[0]?.[1]).toEqual(
      expect.objectContaining({ body: { mode: 'all', classIds: ['c2'] } }),
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('галочка на занятии шлёт PUT с ней в списке, экран рисуется из ответа сервера', async () => {
    const user = userEvent.setup();
    const renamed = { ...EVENING, title: 'Цигун вечером' };
    // Сервер ответил не тем, что ушло (занятие переименовали, пока экран был
    // открыт): экран обязан показать ответ, а не собственное предположение.
    serve(
      STUDENT,
      lessons('selected', ['c1']),
      lessons('selected', ['c1', 'c2'], [MORNING, renamed]),
    );
    renderSection();

    await user.click(await screen.findByRole('checkbox', { name: 'Цигун' }));

    const evening = await screen.findByRole('checkbox', { name: 'Цигун вечером' });
    expect(evening).toBeChecked();
    expect(putCalls()[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        body: { mode: 'selected', classIds: ['c1', 'c2'] },
      }),
    );
  });

  it('снятая галочка уходит из списка в PUT, остальные остаются', async () => {
    const user = userEvent.setup();
    serve(STUDENT, lessons('selected', ['c1', 'c2']), lessons('selected', ['c2']));
    renderSection();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Тайцзи для начинающих · утро' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Тайцзи для начинающих · утро' }),
      ).not.toBeChecked(),
    );
    expect(putCalls()[0]?.[1]).toEqual(
      expect.objectContaining({ body: { mode: 'selected', classIds: ['c2'] } }),
    );
  });

  it('снята последняя галочка — после ответа появляется строка «ни о каких»', async () => {
    const user = userEvent.setup();
    serve(STUDENT, lessons('selected', ['c2']), lessons('selected', []));
    renderSection();

    await user.click(await screen.findByRole('checkbox', { name: 'Цигун' }));

    expect(await screen.findByText(/Ничего не отмечено/)).toBeInTheDocument();
  });

  it('id удалённого занятия в тело не попадает: иначе сервер ответил бы 400 на всё', async () => {
    const user = userEvent.setup();
    serve(
      STUDENT,
      lessons('selected', ['gone', 'c1']),
      lessons('selected', ['c1', 'c2']),
    );
    renderSection();

    await user.click(await screen.findByRole('checkbox', { name: 'Цигун' }));

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0]?.[1]).toEqual(
      expect.objectContaining({ body: { mode: 'selected', classIds: ['c1', 'c2'] } }),
    );
  });

  it('пока PUT в пути, режимы и галочки выключены и положение не меняется', async () => {
    const user = userEvent.setup();
    let finishPut: (value: unknown) => void = () => undefined;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === LESSONS_PATH) return Promise.resolve(lessons('selected', ['c1']));
      if (path === SCOPE_PATH) {
        return new Promise((resolve) => {
          finishPut = resolve;
        });
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    renderSection();

    const evening = await screen.findByRole('checkbox', { name: 'Цигун' });
    await user.click(evening);

    await waitFor(() => expect(evening).toBeDisabled());
    expect(screen.getByRole('radio', { name: 'Обо всех занятиях школы' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Только о выбранных' })).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Тайцзи для начинающих · утро' }),
    ).toBeDisabled();
    // Без оптимистичной отрисовки: галочка не встаёт, пока нет ответа.
    expect(evening).not.toBeChecked();

    finishPut(lessons('selected', ['c1', 'c2']));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Цигун' })).toBeEnabled(),
    );
    expect(screen.getByRole('checkbox', { name: 'Цигун' })).toBeChecked();
  });
});

describe('LessonScopeSection — ошибки', () => {
  it('ответ 400 с текстом из конверта — текст виден, выбор остаётся прежним', async () => {
    const user = userEvent.setup();
    const message =
      'Такого занятия больше нет в расписании. Обновите страницу и отметьте занятия заново.';
    serve(
      STUDENT,
      lessons('selected', ['c1']),
      new ApiError(message, 400, 'invalid_input'),
    );
    renderSection();

    const evening = await screen.findByRole('checkbox', { name: 'Цигун' });
    await user.click(evening);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(evening).not.toBeChecked();
    expect(evening).toBeEnabled();
  });

  it('неопознанная ошибка — общий текст, не текст исключения', async () => {
    const user = userEvent.setup();
    serve(STUDENT, lessons('all', []), new Error('boom'));
    renderSection();

    await user.click(await screen.findByRole('radio', { name: 'Только о выбранных' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
    expect(screen.getByRole('radio', { name: 'Обо всех занятиях школы' })).toBeChecked();
  });

  it('следующая попытка убирает прошлую ошибку', async () => {
    const user = userEvent.setup();
    serve(STUDENT, lessons('all', []), new Error('boom'));
    renderSection();
    await user.click(await screen.findByRole('radio', { name: 'Только о выбранных' }));
    await screen.findByRole('alert');

    serve(STUDENT, lessons('all', []), lessons('selected', []));
    await user.click(screen.getByRole('radio', { name: 'Только о выбранных' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('сбой загрузки — баннер с повтором вместо контролов, повтор перечитывает занятия', async () => {
    const user = userEvent.setup();
    serve(STUDENT, new Error('сеть недоступна'));
    renderSection();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось загрузить занятия. Попробуйте ещё раз.');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    serve(STUDENT, lessons('all', []));
    await user.click(within(alert).getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('radio', { name: 'Обо всех занятиях школы' }),
    ).toBeChecked();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
