// Страница материала целиком: загрузка, поля, сохранение, удаление
// (ADR-0033), по образцу channels/ChannelEditorScreen.test.tsx. Экран ждёт
// два ответа — сам материал (или ничего, у нового) и занятия расписания
// (привязка галочками) — оба мокаются mockApiByPath по префиксу пути.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeClass } from '../test-support/planningFixtures';
import MaterialEditorScreen from './MaterialEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LIST_MARKER = 'Здесь библиотека';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/materials" element={<p>{LIST_MARKER}</p>} />
        <Route path="/materials/new" element={<MaterialEditorScreen />} />
        <Route path="/materials/:materialId" element={<MaterialEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockMaterial(material: MaterialDto) {
  mockApiByPath({
    '/materials/m1': material,
    '/materials': material,
    '/classes': [makeClass()],
  });
}

/** Материал и занятия уже пришли — единственные запросы монтирования позади. */
async function waitForMounted() {
  await screen.findByLabelText('Название');
}

function callsWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

describe('MaterialEditorScreen — загрузка', () => {
  it('материал ещё грузится — скелетон, а не пустой экран', () => {
    mockApiByPath({ '/materials/m1': new Promise(() => {}), '/classes': [makeClass()] });

    const { container } = renderAt('/materials/m1');

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/materials/m1': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/classes': [makeClass()],
    });

    renderAt('/materials/m1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockMaterial(makeMaterial());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('heading', { name: 'Ван Пэйшэн — форма 24' }),
    ).toBeVisible();
  });

  it('/materials/new — заголовок «Новый материал», запроса за конкретным материалом нет', async () => {
    mockApiByPath({ '/materials': [], '/classes': [makeClass()] });

    renderAt('/materials/new');

    expect(
      await screen.findByRole('heading', { name: 'Новый материал' }),
    ).toBeInTheDocument();
    // Подсказка тегов (useMaterialTagOptions.ts) всё равно уходит в сеть — не
    // должно быть только запроса за конкретным (несуществующим) материалом.
    expect(
      mockedApiFetch.mock.calls.some(([path]) => /^\/materials\/[^?]/.test(String(path))),
    ).toBe(false);
  });

  it('«К библиотеке» — ссылка наверху страницы', async () => {
    const user = userEvent.setup();
    mockMaterial(makeMaterial());

    renderAt('/materials/m1');
    await user.click(await screen.findByRole('link', { name: 'К библиотеке' }));

    expect(screen.getByText(LIST_MARKER)).toBeInTheDocument();
  });
});

describe('MaterialEditorScreen — создание', () => {
  it('заполненная форма — POST с собранным телом, возврат к библиотеке', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await user.type(await screen.findByLabelText('Название'), 'Ван Пэйшэн — форма 24');
    await user.type(screen.getByLabelText('Ссылка'), 'https://example.com/book');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const body = callsWithMethod('POST')[0]?.[1] as { body: unknown };
    expect(body.body).toEqual({
      title: 'Ван Пэйшэн — форма 24',
      url: 'https://example.com/book',
      kind: 'book',
      classIds: [],
      access: 'all',
      tags: [],
    });
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('теги — строка через запятую превращается в массив в теле запроса', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await user.type(await screen.findByLabelText('Название'), 'Разбор формы');
    await user.type(screen.getByLabelText('Ссылка'), 'https://example.com/video');
    await user.type(screen.getByLabelText('Теги'), 'ян, база');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const body = callsWithMethod('POST')[0]?.[1] as { body: { tags: unknown } };
    expect(body.body.tags).toEqual(['ян', 'база']);
  });

  it('пустое название — ошибка формы, запроса нет', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await user.click(await screen.findByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('название');
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('тег длиннее лимита — ошибка формы, запроса нет', async () => {
    const user = userEvent.setup();
    const { TAG_LIMITS } = await import('@xuanxue/shared');
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await user.type(await screen.findByLabelText('Название'), 'Разбор формы');
    await user.type(screen.getByLabelText('Ссылка'), 'https://example.com/video');
    await user.type(screen.getByLabelText('Теги'), 'а'.repeat(TAG_LIMITS.length + 1));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('длиннее');
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('сбой подсказки тегов не мешает заполнить форму и сохранить материал', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: unknown, init?: unknown) => {
      const p = String(path);
      if (p.startsWith('/classes')) return Promise.resolve([makeClass()]);
      if ((init as { method?: string } | undefined)?.method === 'POST') {
        return Promise.resolve(makeMaterial());
      }
      if (p.startsWith('/materials')) {
        return Promise.reject(new Error('нет сети'));
      }
      return Promise.reject(new Error(`неожиданный путь: ${p}`));
    });

    renderAt('/materials/new');
    await user.type(await screen.findByLabelText('Название'), 'Название');
    await user.type(screen.getByLabelText('Ссылка'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('вид и занятие выбраны, галочка оплаты — access: paid и classIds в теле', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await user.type(await screen.findByLabelText('Название'), 'Разбор формы');
    await user.type(screen.getByLabelText('Ссылка'), 'https://example.com/video');
    await user.click(screen.getByLabelText('Видео'));
    await user.click(screen.getByLabelText('Тайцзицюань, средняя группа'));
    await user.click(screen.getByLabelText('Открывать только после оплаты'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(1));
    const body = callsWithMethod('POST')[0]?.[1] as { body: unknown };
    expect(body.body).toEqual({
      title: 'Разбор формы',
      url: 'https://example.com/video',
      kind: 'video',
      classIds: ['c1'],
      access: 'paid',
      tags: [],
    });
  });

  it('новый материал — удаления нет', async () => {
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await waitForMounted();

    expect(
      screen.queryByRole('button', { name: 'Удалить материал' }),
    ).not.toBeInTheDocument();
  });
});

describe('MaterialEditorScreen — правка', () => {
  it('поля предзаполнены из материала', async () => {
    mockMaterial(makeMaterial({ classIds: ['c1'], access: 'paid' }));

    renderAt('/materials/m1');

    expect(await screen.findByLabelText('Название')).toHaveValue('Ван Пэйшэн — форма 24');
    expect(screen.getByLabelText('Ссылка')).toHaveValue('https://example.com/book');
    expect(screen.getByLabelText('Книга')).toBeChecked();
    expect(screen.getByLabelText('Тайцзицюань, средняя группа')).toBeChecked();
    expect(screen.getByLabelText('Открывать только после оплаты')).toBeChecked();
  });

  it('теги материала — поле «Теги» предзаполнено строкой через запятую', async () => {
    mockMaterial(makeMaterial({ tags: ['ян', 'база'] }));

    renderAt('/materials/m1');

    expect(await screen.findByLabelText('Теги')).toHaveValue('ян, база');
  });

  it('сохранение без изменений — PATCH с тем же телом', async () => {
    const user = userEvent.setup();
    mockMaterial(makeMaterial());

    renderAt('/materials/m1');
    await waitForMounted();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(callsWithMethod('PATCH')).toHaveLength(1));
    const body = callsWithMethod('PATCH')[0]?.[1] as { body: unknown };
    expect(body.body).toEqual({
      title: 'Ван Пэйшэн — форма 24',
      url: 'https://example.com/book',
      kind: 'book',
      classIds: [],
      access: 'all',
      tags: [],
    });
  });

  it('ошибка сервера с details — список под формой, страница остаётся', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockMaterial(makeMaterial());

    renderAt('/materials/m1');
    await waitForMounted();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Проверьте поля.', 400, 'invalid_input', ['url: недоступен']),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Проверьте поля.');
    expect(alert).toHaveTextContent('url: недоступен');
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });
});

describe('MaterialEditorScreen — удаление', () => {
  it('«Удалить материал» спрашивает подтверждение, отмена ничего не удаляет', async () => {
    const user = userEvent.setup();
    mockMaterial(makeMaterial());

    renderAt('/materials/m1');
    await user.click(await screen.findByRole('button', { name: 'Удалить материал' }));

    expect(screen.getByRole('dialog', { name: 'Удалить материал?' })).toBeInTheDocument();
    expect(callsWithMethod('DELETE')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(callsWithMethod('DELETE')).toHaveLength(0);
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('подтверждение — DELETE и возврат к библиотеке', async () => {
    const user = userEvent.setup();
    mockMaterial(makeMaterial());

    renderAt('/materials/m1');
    await user.click(await screen.findByRole('button', { name: 'Удалить материал' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(callsWithMethod('DELETE')).toHaveLength(1));
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });
});
