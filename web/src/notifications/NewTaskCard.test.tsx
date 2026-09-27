// Карточка нового задания в центре уведомлений — название, рубрика, глубокая
// ссылка на «Задания» и серверная отметка «открыто» (ADR-0063, ADR-0129).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { MY_EXAMS_PATH, examSeenPath } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { MyExamsProvider } from '../student/MyExamsProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { NewTaskCard } from './NewTaskCard';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма первого уровня',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

function renderCard(exam: MyExamDto) {
  return render(
    <MemoryRouter>
      <MyExamsProvider me={null}>
        <ul>
          <NewTaskCard exam={exam} />
        </ul>
      </MyExamsProvider>
    </MemoryRouter>,
  );
}

describe('NewTaskCard', () => {
  it('название и рубрика видны', () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [] });
    renderCard(makeExam());

    expect(screen.getByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByText('Новое задание')).toBeInTheDocument();
  });

  it('ссылка ведёт на «Задания» с examId — открыть тот же диалог, не список (ADR-0129)', () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [] });
    renderCard(makeExam());

    expect(screen.getByRole('link', { name: /Форма первого уровня/ })).toHaveAttribute(
      'href',
      '/tasks?start=e1',
    );
  });

  it('нажатие ставит серверную отметку «открыто» (markSeen)', () => {
    // examSeenPath — первым: он длиннее MY_EXAMS_PATH и начинается с него же
    // (`/me/exams/e1/seen` начинается с `/me/exams`), mockApiByPath отдаёт
    // первое совпадение по порядку записи (test-support/apiFetchMock.ts).
    mockApiByPath({ [examSeenPath('e1')]: [], [MY_EXAMS_PATH]: [] });
    renderCard(makeExam());

    screen.getByRole('link', { name: /Форма первого уровня/ }).click();

    expect(mockedApiFetch).toHaveBeenCalledWith(
      examSeenPath('e1'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
