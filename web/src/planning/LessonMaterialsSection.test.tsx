// Секция «Материалы» страницы даты занятия (ADR-0056): список привязанных,
// «Убрать», «Добавить ссылку» и «Из библиотеки». Мок сети — по пути
// (test-support/apiFetchMock.ts): путь привязанных и путь библиотеки
// различаются параметрами, мутации (POST и PATCH) ловит общий префикс
// `/materials` последним.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LIST_LIMIT_MAX, type MaterialDto } from '@xuanxue/shared';
import { materialsListPath } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { LessonMaterialsSection } from './LessonMaterialsSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LESSON_ID = 'l1';
// Путь секции строит сам хук (useLessonMaterials.ts) — здесь он повторён
// строкой: тест на то и тест, чтобы ловить расхождение, а не повторять
// вычисление проверяемого кода.
const ATTACHED_PATH = `/materials?lessonId=${LESSON_ID}&limit=${LIST_LIMIT_MAX}`;
const LIBRARY_PATH = materialsListPath('', '');

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [LESSON_ID],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

interface RenderOptions {
  attached?: unknown;
  library?: unknown;
  /** Ответы на конкретные пути мутаций — стоят раньше общего `/materials`. */
  mutations?: Record<string, unknown>;
  /** Ответ на `POST /materials` (общий префикс, он же последний). */
  created?: unknown;
}

function renderSection({
  attached = [],
  library = [],
  mutations,
  created = makeMaterial({ id: 'created' }),
}: RenderOptions = {}) {
  mockApiByPath({
    [ATTACHED_PATH]: attached,
    [LIBRARY_PATH]: library,
    ...mutations,
    '/materials': created,
  });
  render(
    <MemoryRouter>
      <LessonMaterialsSection lessonId={LESSON_ID} />
    </MemoryRouter>,
  );
}

function callsWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

function bodyOfFirst(method: string): Record<string, unknown> {
  return (callsWithMethod(method)[0]?.[1] as { body: Record<string, unknown> }).body;
}

function attachedRequests() {
  return mockedApiFetch.mock.calls.filter((call) => call[0] === ATTACHED_PATH);
}

describe('LessonMaterialsSection — привязанные материалы', () => {
  it('привязанный материал виден названием-ссылкой и видом', async () => {
    renderSection({ attached: [makeMaterial({ tags: ['для старшей'] })] });

    expect(
      await screen.findByRole('link', { name: 'Ван Пэйшэн — форма 24' }),
    ).toHaveAttribute('href', 'https://example.com/book');
    expect(screen.getByText('Книга · для старшей')).toBeInTheDocument();
  });

  // ADR-0100: у материала-видео плеер прямо в строке занятия — учителю не
  // нужно открывать вкладку, чтобы вспомнить, что он привязал.
  it('материал со ссылкой на YouTube — кнопка плеера рядом с названием', async () => {
    renderSection({
      attached: [makeMaterial({ kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' })],
    });

    expect(
      await screen.findByRole('button', { name: 'Смотреть здесь' }),
    ).toBeInTheDocument();
  });

  it('пока ни одного материала — объяснение, зачем это поле', async () => {
    renderSection();

    expect(await screen.findByText('Пока ни одной.')).toBeInTheDocument();
  });

  it('материалы ещё грузятся — строка загрузки, а не «пока ни одной»', () => {
    renderSection({ attached: new Promise(() => {}) });

    expect(screen.getByText('Загружаем материалы занятия…')).toBeInTheDocument();
    expect(screen.queryByText(/Пока ни одной/)).not.toBeInTheDocument();
  });

  it('сбой загрузки — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    renderSection({ attached: new ApiError('Сервис недоступен', 503, 'unknown') });

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ [ATTACHED_PATH]: [makeMaterial()] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('link', { name: 'Ван Пэйшэн — форма 24' }),
    ).toBeInTheDocument();
  });

  it('«Убрать» шлёт PATCH без этой даты и не удаляет материал', async () => {
    const user = userEvent.setup();
    renderSection({ attached: [makeMaterial({ lessonIds: [LESSON_ID, 'l2'] })] });

    await user.click(await screen.findByRole('button', { name: 'Убрать' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    expect(callsWithMethod('PATCH')[0]?.[0]).toBe('/materials/m1');
    expect(bodyOfFirst('PATCH')).toEqual({ lessonIds: ['l2'] });
    // Удаление материала живёт на его странице (ADR-0056) — здесь его нет.
    expect(callsWithMethod('DELETE')).toHaveLength(0);
    // Показываем то, что сохранилось: список перечитан после ответа.
    await waitFor(() => expect(attachedRequests()).toHaveLength(2));
  });

  it('сбой отвязки на сервере — текст ошибки рядом со списком', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    renderSection({
      attached: [makeMaterial()],
      mutations: {
        '/materials/m1': new ApiError('Материал уже удалён.', 404, 'not_found'),
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Убрать' }));

    expect(await screen.findByText('Материал уже удалён.')).toBeInTheDocument();
  });

  it('не-ApiError сбой отвязки — общий текст с подсказкой повторить', async () => {
    const user = userEvent.setup();
    renderSection({
      attached: [makeMaterial()],
      mutations: { '/materials/m1': new Error('нет сети') },
    });

    await user.click(await screen.findByRole('button', { name: 'Убрать' }));

    expect(
      await screen.findByText('Не удалось изменить список. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
  });
});

describe('LessonMaterialsSection — «Добавить ссылку»', () => {
  it('форма раскрывается по кнопке, а не стоит развёрнутой', async () => {
    const user = userEvent.setup();
    renderSection();

    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Добавить ссылку' }));

    expect(screen.getByLabelText('Название')).toBeInTheDocument();
  });

  it('сохранение шлёт POST с lessonIds этой даты и перечитывает список', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Добавить ссылку' }));
    await user.type(screen.getByLabelText('Название'), 'Разбор формы 24');
    await user.type(screen.getByLabelText('Ссылка'), 'https://youtu.be/1');
    await user.click(screen.getByLabelText('Видео'));
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    expect(callsWithMethod('POST')[0]?.[0]).toBe('/materials');
    expect(bodyOfFirst('POST')).toEqual({
      title: 'Разбор формы 24',
      url: 'https://youtu.be/1',
      kind: 'video',
      classIds: [],
      access: 'all',
      tags: [],
      lessonIds: [LESSON_ID],
    });
    await waitFor(() => expect(attachedRequests()).toHaveLength(2));
    // Форма закрылась — секция снова показывает свои две кнопки.
    expect(screen.getByRole('button', { name: 'Из библиотеки' })).toBeInTheDocument();
  });

  it('пустое название — ошибка под полем, POST не уходит', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Добавить ссылку' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    expect(await screen.findByText('Впишите название материала.')).toBeInTheDocument();
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('сбой сервера — текст ошибки под формой, набранное остаётся', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    renderSection({
      created: new ApiError('Ссылка длиннее 500 символов.', 400, 'invalid_input'),
    });

    await user.click(await screen.findByRole('button', { name: 'Добавить ссылку' }));
    await user.type(screen.getByLabelText('Название'), 'Разбор формы 24');
    await user.type(screen.getByLabelText('Ссылка'), 'https://youtu.be/1');
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    expect(await screen.findByText('Ссылка длиннее 500 символов.')).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('Разбор формы 24');
  });

  it('«Отменить» закрывает форму', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Добавить ссылку' }));
    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить ссылку' })).toBeInTheDocument();
  });
});

describe('LessonMaterialsSection — «Из библиотеки»', () => {
  const LIBRARY = [
    makeMaterial({ id: 'm2', title: 'Разминка суставов', lessonIds: ['l9'] }),
    makeMaterial({ id: 'm3', title: 'Цигун для глаз', kind: 'video', lessonIds: [] }),
  ];

  async function openLibrary(options: RenderOptions = {}) {
    const user = userEvent.setup();
    renderSection(options);
    await user.click(await screen.findByRole('button', { name: 'Из библиотеки' }));
    return user;
  }

  it('«Добавить» шлёт PATCH с дополненным массивом привязок', async () => {
    const user = await openLibrary({ library: LIBRARY });

    const rows = await screen.findAllByRole('button', { name: 'Добавить' });
    await user.click(rows[0] as HTMLElement);

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    expect(callsWithMethod('PATCH')[0]?.[0]).toBe('/materials/m2');
    expect(bodyOfFirst('PATCH')).toEqual({ lessonIds: ['l9', LESSON_ID] });
  });

  it('уже привязанный материал в кандидатах не повторяется, поиск сужает список', async () => {
    const user = await openLibrary({
      attached: [makeMaterial({ id: 'm2', title: 'Разминка суставов' })],
      library: LIBRARY,
    });

    expect(await screen.findByText('Цигун для глаз')).toBeInTheDocument();
    // «Разминка суставов» уже на занятии — в списке кандидатов её нет,
    // название встречается один раз, выше в самой секции.
    expect(screen.getAllByText('Разминка суставов')).toHaveLength(1);

    await user.type(screen.getByPlaceholderText(/Найти материал/), 'цигун');
    expect(screen.getByText('Цигун для глаз')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/Найти материал/));
    await user.type(screen.getByPlaceholderText(/Найти материал/), 'кунг-фу');
    expect(screen.getByText('По этому запросу ничего не нашлось.')).toBeInTheDocument();
  });

  it('вся библиотека уже на этом занятии — так и сказано', async () => {
    await openLibrary({
      attached: [makeMaterial({ id: 'm2' }), makeMaterial({ id: 'm3' })],
      library: LIBRARY,
    });

    expect(
      await screen.findByText('Вся библиотека уже на этом занятии.'),
    ).toBeInTheDocument();
  });

  it('библиотека пуста — ссылка на «Материалы», а не пустой список', async () => {
    await openLibrary();

    expect(await screen.findByText(/В библиотеке пока пусто/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть материалы' })).toHaveAttribute(
      'href',
      '/materials',
    );
  });

  it('библиотека ещё грузится — строка загрузки, а не «пусто»', async () => {
    await openLibrary({ library: new Promise(() => {}) });

    expect(screen.getByText('Загружаем материалы…')).toBeInTheDocument();
    expect(screen.queryByText(/В библиотеке пока пусто/)).not.toBeInTheDocument();
  });

  it('сбой загрузки библиотеки — ошибка и повтор вместо списка', async () => {
    const { ApiError } = await import('../api/http');
    const user = await openLibrary({
      library: new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ [ATTACHED_PATH]: [], [LIBRARY_PATH]: LIBRARY });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Цигун для глаз')).toBeInTheDocument();
  });

  it('«Закрыть» убирает поиск', async () => {
    const user = await openLibrary({ library: LIBRARY });

    await user.click(await screen.findByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByPlaceholderText(/Найти материал/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Из библиотеки' })).toBeInTheDocument();
  });
});
