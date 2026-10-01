// «Сообщить ученикам» на странице материала (ADR-0162): галочка есть только у
// нового материала и только пока он открыт ученикам, по умолчанию стоит, а правка
// её не шлёт — PATCH поля не знает. Отдельный файл рядом с MaterialEditorScreen.test.tsx:
// тот держит остальное поведение страницы.
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

const NOTIFY_LABEL = 'Сообщить ученикам';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [],
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
        <Route path="/materials" element={<p>Здесь материалы</p>} />
        <Route path="/materials/new" element={<MaterialEditorScreen />} />
        <Route path="/materials/:materialId" element={<MaterialEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function bodyOf(method: string): Record<string, unknown> {
  const call = mockedApiFetch.mock.calls.find(
    ([, init]) => (init as { method?: string } | undefined)?.method === method,
  );
  return (call?.[1] as { body: Record<string, unknown> }).body;
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Название'), 'Разбор формы');
  await user.type(screen.getByLabelText('Ссылка'), 'https://example.com/video');
}

describe('MaterialEditorScreen — «Сообщить ученикам» (ADR-0162)', () => {
  it('новый материал для всех учеников — галочка стоит сразу, с пояснением, кому придёт', async () => {
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');

    const box = await screen.findByLabelText(NOTIFY_LABEL);
    expect(box).toBeChecked();
    expect(
      screen.getByText(/Придёт тем, кто включил/, { exact: false }),
    ).toHaveTextContent(
      '«Новый материал» в уведомлениях, если материал касается их занятий.',
    );
  });

  it('галочка стоит — POST несёт notifyStudents: true', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(bodyOf('POST')).toBeDefined());
    expect(bodyOf('POST')).toMatchObject({ notifyStudents: true });
  });

  it('галочку сняли — в теле POST нет ключа notifyStudents', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await fillRequired(user);
    await user.click(screen.getByLabelText(NOTIFY_LABEL));
    expect(screen.getByLabelText(NOTIFY_LABEL)).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(bodyOf('POST')).toBeDefined());
    expect(bodyOf('POST')).not.toHaveProperty('notifyStudents');
  });

  // Служебный материал ученик не увидит вовсе — сообщать о нём нечего, и поле
  // не маячит: оно пропадает вместе с выбором.
  it('«Только преподаватели» — галочки нет и ключа notifyStudents в теле POST нет', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await fillRequired(user);
    await user.click(screen.getByLabelText('Только преподаватели'));

    expect(screen.queryByLabelText(NOTIFY_LABEL)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(bodyOf('POST')).toBeDefined());
    expect(bodyOf('POST')).not.toHaveProperty('notifyStudents');
  });

  it('вернули «Все ученики» после служебного — галочка снова есть и стоит', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/materials': makeMaterial(), '/classes': [makeClass()] });

    renderAt('/materials/new');
    await user.click(await screen.findByLabelText('Только преподаватели'));
    await user.click(screen.getByLabelText('Все ученики'));

    expect(screen.getByLabelText(NOTIFY_LABEL)).toBeChecked();
  });

  it('правка существующего материала — галочки нет, PATCH без notifyStudents', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/materials/m1': makeMaterial(),
      '/materials': makeMaterial(),
      '/classes': [makeClass()],
    });

    renderAt('/materials/m1');
    await screen.findByLabelText('Название');

    expect(screen.queryByLabelText(NOTIFY_LABEL)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(bodyOf('PATCH')).toBeDefined());
    expect(bodyOf('PATCH')).not.toHaveProperty('notifyStudents');
  });
});
