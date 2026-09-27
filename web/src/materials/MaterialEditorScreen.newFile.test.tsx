// Создание материала одним файлом, без ссылки (ADR-0133) — отдельным файлом
// от MaterialEditorScreen.test.tsx (454 строк, храповик размера файл больше
// не растит). Два запроса одним «Сохранить»: POST /materials без `url`,
// затем POST /materials/:id/file по id из ответа.
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

const LIST_MARKER = 'Здесь материалы';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Методичка',
    kind: 'document',
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

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/materials/new']}>
      <Routes>
        <Route path="/materials" element={<p>{LIST_MARKER}</p>} />
        <Route path="/materials/new" element={<MaterialEditorScreen />} />
        <Route path="/materials/:materialId" element={<MaterialEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function callsWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

async function fillTitleAndFile(file: File) {
  await userEvent.type(await screen.findByLabelText('Название'), 'Методичка');
  await userEvent.upload(screen.getByLabelText('Добавить файл'), file);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
}

describe('MaterialEditorScreen — создание одним файлом, без ссылки (ADR-0133)', () => {
  it('POST без url, затем загрузка файла по id материала, возврат к списку', async () => {
    const created = makeMaterial();
    mockApiByPath({
      '/materials/m1/file': { ...created, file: undefined },
      '/materials': created,
      '/classes': [makeClass()],
      '/auth/config': { emailLoginEnabled: false, fileStorageEnabled: true },
    });

    renderNew();
    await fillTitleAndFile(
      new File(['%PDF-1.7'], 'Методичка.pdf', { type: 'application/pdf' }),
    );

    await waitFor(() => expect(callsWithMethod('POST')).toHaveLength(2));
    const createCall = callsWithMethod('POST')[0];
    expect(createCall?.[0]).toBe('/materials');
    expect(createCall?.[1]).toMatchObject({
      body: { title: 'Методичка', kind: 'book' },
    });
    expect('url' in (createCall?.[1] as { body: Record<string, unknown> }).body).toBe(
      false,
    );

    const uploadCall = callsWithMethod('POST')[1];
    expect(String(uploadCall?.[0])).toMatch(/^\/materials\/m1\/file\?name=/);

    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('ссылка не вписана, но файл не выбран — форма не проходит валидацию', async () => {
    mockApiByPath({
      '/materials': makeMaterial(),
      '/classes': [makeClass()],
      '/auth/config': { emailLoginEnabled: false, fileStorageEnabled: true },
    });

    renderNew();
    await userEvent.type(await screen.findByLabelText('Название'), 'Методичка');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ссылку на материал или');
    expect(callsWithMethod('POST')).toHaveLength(0);
  });

  it('сбой загрузки — материал создан, ошибка под формой, страница остаётся и правит его', async () => {
    const created = makeMaterial();
    mockApiByPath({
      '/materials/m1/file': new Error('нет сети'),
      '/materials': created,
      '/classes': [makeClass()],
      '/auth/config': { emailLoginEnabled: false, fileStorageEnabled: true },
    });

    renderNew();
    await fillTitleAndFile(
      new File(['%PDF-1.7'], 'Методичка.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Материал сохранён, а файл не загрузился.',
    );
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
    // Страница стала страницей созданного материала — есть чем его удалить,
    // второе «Сохранить» его правит, а не заводит дубль (ADR-0133). POST'а
    // ровно два: создание материала и неудавшаяся попытка загрузить файл —
    // второго вызова «создать материал» нет.
    expect(screen.getByRole('button', { name: 'Удалить материал' })).toBeInTheDocument();
    expect(callsWithMethod('POST')).toHaveLength(2);
    expect(callsWithMethod('POST')[0]?.[0]).toBe('/materials');
  });
});
