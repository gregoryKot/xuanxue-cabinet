// Тесты MyExamsProvider (ADR-0063, ADR-0074). Сами данные списка и рубрики
// проверяет TasksScreen.test.tsx, счётчик у колокольчика —
// useNotificationsData.test.ts; здесь — за что отвечает сама обёртка: один
// запрос на двух читателей, понятный отказ без провайдера, старт попытки и
// правило «идёт ли сам запрос» (роль + путь, ADR-0074). Тот же приём, что у
// notifications/NotificationsProvider.test.tsx («один счётчик на всех»).
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, MeDto, MyExamDto, UserRole } from '@xuanxue/shared';
import { MY_EXAMS_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { MyExamsProvider, useMyExams } from './MyExamsProvider';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const EXAM: MyExamDto = {
  id: 'e1',
  title: 'Форма 1',
  description: '',
  level: '1',
  attemptsAllowed: 3,
  attemptsUsed: 0,
};

const STUDENT: MeDto = {
  id: 'u1',
  name: 'Аня',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};

/** teacher/assistant/admin — тот же список, что TEACHER_ROLES в
 * screenAccess.ts. */
function staffMe(role: UserRole): MeDto {
  return { ...STUDENT, id: 's1', name: 'Штат', roles: [role] };
}

/** Сколько раз апи звали ровно по адресу списка экзаменов — не считает POST
 * старта попытки под другим путём (тот же приём, что feedCallCount() в
 * useNotificationsData.test.ts). */
function examsCallCount(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === MY_EXAMS_PATH).length;
}

/** Провайдеру нужен Router — он решает `enabled` по текущему пути
 * (ADR-0074) — и роль (`me`), поэтому у каждого рендера здесь своя пара. */
function renderWithProvider(me: MeDto | null, ui: ReactNode, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MyExamsProvider me={me}>{ui}</MyExamsProvider>
    </MemoryRouter>,
  );
}

describe('useMyExams вне MyExamsProvider', () => {
  it('бросает понятную ошибку', () => {
    expect(() => renderHook(() => useMyExams())).toThrow('useMyExams() вызван вне');
  });
});

describe('MyExamsProvider — один запрос на всех', () => {
  it('два читателя под одним провайдером видят один список и один запрос GET /me/exams', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [EXAM] });

    function Reader({ label }: { label: string }) {
      const { data } = useMyExams();
      return <span>{`${label}:${data?.length ?? '—'}`}</span>;
    }

    renderWithProvider(
      STUDENT,
      <>
        <Reader label="задания" />
        <Reader label="колокольчик" />
      </>,
    );

    // Ради этого провайдер и существует: TasksScreen.tsx и центр уведомлений
    // обязаны жить с одного запроса — баг был в том, что GET /me/exams звался
    // дважды и заводил две расходящиеся копии состояния.
    await waitFor(() => expect(screen.getByText('задания:1')).toBeInTheDocument());
    expect(screen.getByText('колокольчик:1')).toBeInTheDocument();
    expect(examsCallCount()).toBe(1);
  });
});

describe('MyExamsProvider — startAttempt', () => {
  it('отдаёт попытку — POST идёт на /exams/:id/attempts', async () => {
    const attempt: Partial<ExamAttemptDto> = { id: 'attempt-1' };
    mockApiByPath({ [MY_EXAMS_PATH]: [EXAM], '/exams/e1/attempts': attempt });

    const { result } = renderHook(() => useMyExams(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <MyExamsProvider me={STUDENT}>{children}</MyExamsProvider>
        </MemoryRouter>
      ),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.startAttempt('e1')).resolves.toEqual(attempt);
    expect(mockedApiFetch).toHaveBeenCalledWith('/exams/e1/attempts', {
      method: 'POST',
    });
  });
});

// ADR-0074: экзамены — механика ученика, штат школы не сдаёт попыток и
// запрос ради счётчика уведомлений ему не нужен — кроме «/tasks», куда штат
// тоже попадает по прямой ссылке (canSeeRoute, screenAccess.ts) и где список
// нужен самому экрану.
describe('MyExamsProvider — enabled по роли и пути (ADR-0074)', () => {
  function Reader() {
    const { data } = useMyExams();
    return <span>{data?.length ?? '—'}</span>;
  }

  it.each(['teacher', 'assistant', 'admin'] as const)(
    '%s вне «/tasks» — запроса нет',
    async (role) => {
      mockApiByPath({ [MY_EXAMS_PATH]: [EXAM] });
      renderWithProvider(staffMe(role), <Reader />, '/notifications');

      await screen.findByText('—');
      expect(examsCallCount()).toBe(0);
    },
  );

  it('штат на «/tasks» — запрос идёт, список виден', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [EXAM] });
    renderWithProvider(staffMe('teacher'), <Reader />, '/tasks');

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    expect(examsCallCount()).toBe(1);
  });

  it('ученик — запрос идёт на любом пути', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [EXAM] });
    renderWithProvider(STUDENT, <Reader />, '/notifications');

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    expect(examsCallCount()).toBe(1);
  });
});
