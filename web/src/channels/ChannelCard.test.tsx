// Строка канала в списке: что видно и что открывается по нажатию (ADR-0033).
// Переключатель `active` и «Проверить» здесь больше не живут — они на
// странице канала (ChannelEditorScreen.test.tsx).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import { ChannelCard } from './ChannelCard';
import type { ChannelGroupLine } from './channelGroupText';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    target: '777',
    groupId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(
  overrides: Partial<ChannelDto> = {},
  groupLine?: ChannelGroupLine | null,
) {
  const onSelect = vi.fn();
  const view = render(
    <ul>
      <ChannelCard
        channel={makeChannel(overrides)}
        onSelect={onSelect}
        groupLine={groupLine}
      />
    </ul>,
  );
  return { onSelect, unmount: view.unmount };
}

describe('ChannelCard', () => {
  it('тип, название и адрес — открывает страницу канала по нажатию', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCard();

    expect(screen.getByText('ВК · ВК школы')).toBeInTheDocument();
    expect(screen.getByText('777')).toBeInTheDocument();

    await user.click(screen.getByText('ВК · ВК школы'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('без адреса — прочерк', () => {
    renderCard({ type: 'manual', target: '' });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('у канала нет пометки «Выключен»: выключателя нет, строка — только адрес (ADR-0194)', () => {
    renderCard({});
    expect(screen.getByText('777')).toBeInTheDocument();
    expect(screen.queryByText(/Выключен/)).not.toBeInTheDocument();
  });

  it('строка группы: название выделено, предупреждение — цветом опасности (ADR-0195)', () => {
    const { unmount } = renderCard(
      { groupId: 'g1' },
      { text: 'Группа: **Начинающие** · 5 занятий', isWarning: false },
    );
    expect(screen.getByText('Начинающие').tagName).toBe('STRONG');
    expect(screen.getByText(/5 занятий/)).not.toHaveStyle({ color: 'var(--danger)' });
    unmount();

    renderCard({}, { text: 'Группа не выбрана — посты сюда не уходят', isWarning: true });
    expect(screen.getByText('Группа не выбрана — посты сюда не уходят')).toHaveStyle({
      color: 'var(--danger)',
    });
  });

  it('группа ещё грузится (null) — скелетон; не передана — строки нет', () => {
    const { container, unmount } = render(
      <ul>
        <ChannelCard channel={makeChannel()} onSelect={vi.fn()} groupLine={null} />
      </ul>,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    unmount();

    renderCard();
    expect(screen.queryByText(/Группа/)).not.toBeInTheDocument();
  });

  // Список каналов — одна карточка (docs/adr/0043): волосяную линию между
  // строками красит сама строка, а не контейнер, поэтому у последней строки
  // её быть не должно — иначе под линией останется голая полоска фона.
  it('последняя строка — без нижней волосяной линии, у остальных линия есть', () => {
    render(
      <ul>
        <ChannelCard
          channel={makeChannel({ id: 'ch1', title: 'Первый канал' })}
          onSelect={vi.fn()}
        />
        <ChannelCard
          channel={makeChannel({ id: 'ch2', title: 'Второй канал' })}
          onSelect={vi.fn()}
          isLast
        />
      </ul>,
    );

    const firstRow = screen.getByText('ВК · Первый канал').closest('li');
    const lastRow = screen.getByText('ВК · Второй канал').closest('li');

    expect(firstRow?.style.borderBottom).toBe('1px solid var(--panel)');
    // jsdom не раскладывает `border-bottom` с var() в цвете на длинные
    // свойства, а геттер шорт-формы для borderBottom: 'none' отдаёт «medium»
    // (баг cssstyle) — сравниваем длинную форму, её jsdom выставляет верно.
    expect(lastRow?.style.borderBottomStyle).toBe('none');
  });

  // Общую карточку рисует список (ChannelsScreen.tsx), не строка — своя
  // заливка на кнопке выглядела бы рамкой поверх общей карточки.
  it('строка не несёт свой фон — карточку рисует список, а не кнопка', () => {
    renderCard();

    expect(screen.getByRole('button').style.background).toBe('transparent');
  });
});
