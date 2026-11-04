// Раздел «Группы» экрана «Школа» (ADR-0193, ADR-0195): список с числом занятий и
// каналами группы, переименование на месте, удаление только у группы без
// занятий и каналов, добавление.
// Сеть — mockApiByPath по пути (ADR-0116): путь записи совпадает с путём
// списка, поэтому ответ на действие ставится вторым вызовом.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto, GroupDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { GroupsSection } from './GroupsSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeGroup(
  id: string,
  name: string,
  classCount: number,
  channelCount = 0,
): GroupDto {
  return {
    id,
    name,
    classCount,
    channelCount,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const BEGINNERS = makeGroup('g1', 'Начинающие', 3, 1);
const MIDDLE = makeGroup('g2', 'Средние', 0);

const CHANNEL: ChannelDto = {
  id: 'ch1',
  type: 'telegram',
  title: 'Тайцзи вечер',
  target: '@taiji',
  groupIds: ['g1'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function writeCalls() {
  return mockedApiFetch.mock.calls.filter((call) =>
    ['POST', 'PATCH', 'DELETE'].includes(
      (call[1] as { method?: string } | undefined)?.method ?? '',
    ),
  );
}

async function renderLoaded(
  groups: GroupDto[] = [BEGINNERS, MIDDLE],
  channels: ChannelDto[] = [CHANNEL],
) {
  mockApiByPath({ '/groups': groups, '/channels': channels });
  render(<GroupsSection />);
  await screen.findByRole('heading', { name: 'Группы' });
  if (groups.length > 0) await screen.findByText(groups[0]?.name ?? '');
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  if (!row) throw new Error(`нет строки «${name}»`);
  return row;
}

describe('GroupsSection — список', () => {
  it('объяснение до списка, число групп и занятий в каждой', async () => {
    await renderLoaded();

    expect(screen.getByText(/Группы учеников/)).toHaveTextContent(
      'начинающие, средние, старшие',
    );
    expect(screen.getByText(/Группы учеников/)).toHaveTextContent('общая группа');
    expect(screen.getByText(/Групп:/)).toHaveTextContent('Групп: 2');
    expect(
      within(rowOf('Начинающие')).getByText('3 занятия · каналы: Тайцзи вечер'),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Средние')).getByText('Занятий нет · канала нет'),
    ).toBeInTheDocument();
  });

  it('канал с двумя группами назван в строке каждой из них (ADR-0196)', async () => {
    await renderLoaded(
      [BEGINNERS, MIDDLE],
      [{ ...CHANNEL, title: 'Общий чат', groupIds: ['g1', 'g2'] }],
    );

    expect(
      within(rowOf('Начинающие')).getByText('3 занятия · каналы: Общий чат'),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Средние')).getByText('Занятий нет · каналы: Общий чат'),
    ).toBeInTheDocument();
  });

  it('скелетон, пока список не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = render(<GroupsSection />);

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('школа без групп — «Групп пока нет» и поле для первой', async () => {
    await renderLoaded([]);

    expect(await screen.findByText('Групп пока нет')).toBeInTheDocument();
    expect(screen.getByLabelText('Новая группа')).toBeInTheDocument();
  });

  it('список не загрузился — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/groups': new ApiError('Сервис недоступен', 503, 'unknown') });
    render(<GroupsSection />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ '/groups': [MIDDLE] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Средние')).toBeInTheDocument();
  });
});

describe('GroupsSection — добавление', () => {
  it('«Добавить» заводит группу, она встаёт в конец списка, поле очищается', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    mockApiByPath({ '/groups': makeGroup('g3', 'Старшие', 0) });

    await user.type(screen.getByLabelText('Новая группа'), 'Старшие');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByText('Старшие')).toBeInTheDocument();
    expect(screen.getByLabelText('Новая группа')).toHaveValue('');
    expect(writeCalls()[0]).toEqual([
      '/groups',
      expect.objectContaining({ method: 'POST', body: { name: 'Старшие' } }),
    ]);
    expect(screen.getByText(/Групп:/)).toHaveTextContent('Групп: 3');
  });

  it('дубль — текст сервера под полем, введённое остаётся', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    mockApiByPath({
      '/groups': new ApiError(
        'Группа «Средние» уже есть. Отметьте её в списке.',
        409,
        'conflict',
      ),
    });

    await user.type(screen.getByLabelText('Новая группа'), 'средние');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Группа «Средние» уже есть',
    );
    expect(screen.getByLabelText('Новая группа')).toHaveValue('средние');
  });
});

describe('GroupsSection — переименование', () => {
  it('«Переименовать» → новое название → «Сохранить» меняет строку', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    mockApiByPath({ '/groups/g2': makeGroup('g2', 'Продолжающие', 0) });

    await user.click(
      within(rowOf('Средние')).getByRole('button', { name: /Переименовать/ }),
    );
    const input = screen.getByLabelText('Название группы');
    expect(input).toHaveValue('Средние');
    await user.clear(input);
    await user.type(input, 'Продолжающие');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Продолжающие')).toBeInTheDocument();
    expect(screen.queryByLabelText('Название группы')).not.toBeInTheDocument();
    expect(writeCalls()[0]).toEqual([
      '/groups/g2',
      expect.objectContaining({ method: 'PATCH', body: { name: 'Продолжающие' } }),
    ]);
  });

  it('то же название — запрос не уходит, строка закрывается', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(
      within(rowOf('Средние')).getByRole('button', { name: /Переименовать/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(writeCalls()).toHaveLength(0);
    expect(screen.queryByLabelText('Название группы')).not.toBeInTheDocument();
  });

  it('пустое название — подсказка, запрос не уходит', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(
      within(rowOf('Средние')).getByRole('button', { name: /Переименовать/ }),
    );
    await user.clear(screen.getByLabelText('Название группы'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Впишите название группы.',
    );
    expect(writeCalls()).toHaveLength(0);
  });

  it('сервер отказал — текст в строке, режим правки остаётся', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    mockApiByPath({
      '/groups/g2': new ApiError(
        'Группа «Начинающие» уже есть. Отметьте её в списке.',
        409,
        'conflict',
      ),
    });

    await user.click(
      within(rowOf('Средние')).getByRole('button', { name: /Переименовать/ }),
    );
    const input = screen.getByLabelText('Название группы');
    await user.clear(input);
    await user.type(input, 'начинающие');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('уже есть');
    expect(screen.getByLabelText('Название группы')).toHaveValue('начинающие');
  });

  it('«Отменить» возвращает строку без запроса', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(
      within(rowOf('Средние')).getByRole('button', { name: /Переименовать/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(screen.queryByLabelText('Название группы')).not.toBeInTheDocument();
    expect(writeCalls()).toHaveLength(0);
  });
});

describe('GroupsSection — удаление', () => {
  it('у группы с занятиями и каналом кнопки «Удалить» нет — вместо неё причина', async () => {
    await renderLoaded();

    const row = within(rowOf('Начинающие'));
    expect(row.queryByRole('button', { name: /Удалить/ })).not.toBeInTheDocument();
    expect(row.getByText('Удалить нельзя: есть занятия и каналы')).toBeInTheDocument();
  });

  it('группа только с каналом — причина называет каналы; только с занятиями — занятия', async () => {
    await renderLoaded(
      [makeGroup('g1', 'Начинающие', 0, 1), makeGroup('g2', 'Средние', 2, 0)],
      [CHANNEL],
    );

    expect(
      within(rowOf('Начинающие')).getByText('Удалить нельзя: есть каналы'),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Средние')).getByText('Удалить нельзя: есть занятия'),
    ).toBeInTheDocument();
  });

  it('каналы не загрузились — строка группы остаётся, число каналов из самой группы', async () => {
    mockApiByPath({
      '/groups': [BEGINNERS, MIDDLE],
      '/channels': new ApiError('сеть', 503, 'unknown'),
    });
    render(<GroupsSection />);

    expect(await screen.findByText('3 занятия · каналов: 1')).toBeInTheDocument();
    expect(screen.getByText('Занятий нет · канала нет')).toBeInTheDocument();
  });

  it('группа без занятий удаляется, из списка уходит строка', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    mockApiByPath({ '/groups/g2': undefined });

    await user.click(within(rowOf('Средние')).getByRole('button', { name: /Удалить/ }));

    await screen.findByText(/Групп:/);
    expect(screen.queryByText('Средние')).not.toBeInTheDocument();
    expect(writeCalls()[0]).toEqual([
      '/groups/g2',
      expect.objectContaining({ method: 'DELETE' }),
    ]);
  });

  it('сервер отказал — текст в строке, группа остаётся', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    mockApiByPath({
      '/groups/g2': new ApiError('Группа отмечена у занятий: 1.', 409, 'conflict'),
    });

    await user.click(within(rowOf('Средние')).getByRole('button', { name: /Удалить/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Группа отмечена у занятий',
    );
    expect(screen.getByText('Средние')).toBeInTheDocument();
  });
});
