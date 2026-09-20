// Секция «Даты занятий» экрана тега (ADR-0075/0078) — список без окна,
// честная пустота, карточка ведёт на страницу занятия.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeClass, makeLesson } from '../test-support/planningFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { TagLessonsSection } from './TagLessonsSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const LESSON_EDITOR_MARKER = 'Здесь страница занятия';

function renderSection(tag = 'дракон', classes = [makeClass()]) {
  return render(
    <MemoryRouter initialEntries={['/materials/tags']}>
      <Routes>
        <Route
          path="/materials/tags"
          element={<TagLessonsSection tag={tag} classes={classes} />}
        />
        <Route path="/planning/:lessonId" element={<p>{LESSON_EDITOR_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TagLessonsSection — загрузка', () => {
  it('скелетон, пока список не пришёл', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const { container } = renderSection();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('TagLessonsSection — пустой список (честная пустота, ADR-0075)', () => {
  it('нет занятий с этим тегом — текст с именем тега, не «0»', async () => {
    mockApiByPath({ '/lessons': [] });

    renderSection('дракон');

    expect(
      await screen.findByText('Занятий с тегом «дракон» пока нет.'),
    ).toBeInTheDocument();
  });
});

describe('TagLessonsSection — список', () => {
  it('дата занятия рендерится карточкой LessonCard и ведёт на страницу занятия', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/lessons': [makeLesson({ id: 'l1', classId: 'c1', topic: 'Разбор толчка' })],
    });

    renderSection('дракон', [makeClass({ id: 'c1', title: 'Тайцзицюань, средняя' })]);

    const card = await screen.findByText('Тайцзицюань, средняя');
    expect(screen.getByText(/Разбор толчка/)).toBeInTheDocument();

    await user.click(card);
    expect(await screen.findByText(LESSON_EDITOR_MARKER)).toBeInTheDocument();
  });

  it('запрос без tag — уходит без from/to (ADR-0078)', async () => {
    mockApiByPath({ '/lessons': [] });
    renderSection('дракон');

    await screen.findByText('Занятий с тегом «дракон» пока нет.');

    const [path] = mockedApiFetch.mock.calls[0] as [string];
    expect(path).toContain('tag=');
    expect(path).not.toContain('from=');
    expect(path).not.toContain('to=');
  });

  it('сбой загрузки — баннер и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/lessons': new ApiError('Сервис недоступен', 503, 'unknown') });

    renderSection('дракон');
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ '/lessons': [] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByText('Занятий с тегом «дракон» пока нет.'),
    ).toBeInTheDocument();
  });

  it('занятие без найденного класса — «—» вместо пустого места', async () => {
    mockApiByPath({ '/lessons': [makeLesson({ id: 'l1', classId: 'нет-такого' })] });

    renderSection('дракон', [makeClass()]);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });

  // ADR-0075 «Экран тега — общая выдача»: дата занятия — с записью, если
  // она есть. LessonCard.tsx сам решает, показывать ли «запись есть» — этот
  // тест лишь подтверждает, что секция экрана тега доносит recordings до неё.
  it('у занятия есть запись — «запись есть» в строке карточки', async () => {
    mockApiByPath({
      '/lessons': [
        makeLesson({
          recordings: [{ id: 'r1', title: 'Запись занятия', url: 'https://x' }],
        }),
      ],
    });

    renderSection('дракон');

    expect(await screen.findByText(/запись есть/)).toBeInTheDocument();
  });
});
