// Тесты MyExamsProvider (ADR-0063). Сами данные списка и рубрики проверяет
// TasksScreen.test.tsx, счётчик у колокольчика — useNotificationsData.test.ts;
// здесь только то, за что отвечает сама обёртка: один запрос на двух
// читателей, понятный отказ без провайдера и старт попытки. Тот же приём,
// что у notifications/NotificationsProvider.test.tsx («один счётчик на всех»).
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, MyExamDto } from '@xuanxue/shared';
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

/** Сколько раз апи звали ровно по адресу списка экзаменов — не считает POST
 * старта попытки под другим путём (тот же приём, что feedCallCount() в
 * useNotificationsData.test.ts). */
function examsCallCount(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === MY_EXAMS_PATH).length;
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

    render(
      <MyExamsProvider>
        <Reader label="задания" />
        <Reader label="колокольчик" />
      </MyExamsProvider>,
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

    const { result } = renderHook(() => useMyExams(), { wrapper: MyExamsProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.startAttempt('e1')).resolves.toEqual(attempt);
    expect(mockedApiFetch).toHaveBeenCalledWith('/exams/e1/attempts', {
      method: 'POST',
    });
  });
});
