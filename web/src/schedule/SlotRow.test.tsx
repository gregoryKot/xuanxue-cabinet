// Строка занятия: время, название, место и пометки — каждое своим элементом,
// поэтому проверки точечные, а не по одной склеенной строке (отзыв владельца
// 2026-10-02: диапазон «08:00–09:00» ломался на тире, места не было вовсе).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotRow } from './SlotRow';
import type { ScheduleSlot } from './scheduleGrid';

function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return {
    classId: 'c1',
    ruleId: 'r1',
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    format: 'online',
    startTime: '19:00',
    endTime: '20:00',
    startMinutes: 19 * 60,
    isBiweekly: false,
    active: true,
    linkMissing: false,
    destination: null,
    tags: [],
    ...overrides,
  };
}

function renderRow(overrides: Partial<ScheduleSlot> = {}, onSelect = vi.fn()) {
  return render(<SlotRow slot={makeSlot(overrides)} onSelect={onSelect} />);
}

describe('SlotRow — время', () => {
  it('начало и конец — отдельными элементами, а не одним диапазоном', () => {
    renderRow();

    const start = screen.getByText('19:00');
    const end = screen.getByText('20:00');
    expect(start).not.toBe(end);
    expect(screen.queryByText(/19:00\s*[–-]\s*20:00/)).not.toBeInTheDocument();
  });

  it('конец за полночь показывается как есть — «00:30»', () => {
    renderRow({ startTime: '23:30', endTime: '00:30' });

    expect(screen.getByText('23:30')).toBeInTheDocument();
    expect(screen.getByText('00:30')).toBeInTheDocument();
  });
});

describe('SlotRow — название и группа', () => {
  it('название и подпись группы — в одной строке через « · »', () => {
    renderRow();

    expect(screen.getByText('Тайцзицюань').textContent).toBe(
      'Тайцзицюань · средняя группа',
    );
  });

  it('без подписи группы — разделителя « · » нет вовсе', () => {
    renderRow({ groupLabel: '' });

    expect(screen.getByText('Тайцзицюань').textContent).toBe('Тайцзицюань');
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});

describe('SlotRow — место', () => {
  it('онлайн — «Онлайн», адреса нет', () => {
    renderRow({ format: 'online', location: 'Аркави 3, Тель-Авив' });

    expect(screen.getByText('Онлайн')).toBeInTheDocument();
    expect(screen.queryByText('Аркави 3, Тель-Авив')).not.toBeInTheDocument();
  });

  it('офлайн с адресом — адрес, без слова «Онлайн»', () => {
    renderRow({ format: 'offline', location: 'Парк Яркон, у входа' });

    expect(screen.getByText('Парк Яркон, у входа')).toBeInTheDocument();
    expect(screen.queryByText(/онлайн/i)).not.toBeInTheDocument();
  });

  it('офлайн без адреса — «Офлайн», пустоты нет', () => {
    renderRow({ format: 'offline', location: undefined });

    expect(screen.getByText('Офлайн')).toBeInTheDocument();
  });

  it('офлайн с пробельным адресом — тоже «Офлайн»', () => {
    renderRow({ format: 'offline', location: '   ' });

    expect(screen.getByText('Офлайн')).toBeInTheDocument();
  });

  it('и то и другое — адрес и «и онлайн» отдельными частями', () => {
    renderRow({ format: 'both', location: 'Аркави 3, Тель-Авив' });

    expect(screen.getByText('Аркави 3, Тель-Авив')).toBeInTheDocument();
    expect(screen.getByText('и онлайн')).toBeInTheDocument();
  });

  it('значок места декоративный — скрыт от скринридера', () => {
    const { container } = renderRow({ format: 'both', location: 'Аркави 3' });

    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(2);
    icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
  });
});

describe('SlotRow — теги курса (ADR-0072)', () => {
  it('теги — одной подписью через запятую', () => {
    renderRow({ tags: ['начинающие', 'медитация'] });

    expect(screen.getByText('начинающие, медитация')).toBeInTheDocument();
  });

  it('без тегов — подписи нет', () => {
    renderRow({ tags: [] });

    expect(screen.queryByText(/начинающие/)).not.toBeInTheDocument();
  });
});

describe('SlotRow — пометки', () => {
  it('активное занятие — без пометки «выключено»', () => {
    renderRow({ active: true });

    expect(screen.queryByText('выключено')).not.toBeInTheDocument();
  });

  it('выключенное занятие — пометка «выключено»', () => {
    renderRow({ active: false });

    expect(screen.getByText('выключено')).toBeInTheDocument();
  });

  it('онлайн без ссылки Zoom — «без ссылки» красным прямо в расписании', () => {
    renderRow({ linkMissing: true });

    expect(screen.getByText('без ссылки')).toHaveStyle({ color: 'var(--danger)' });
  });

  it('ссылка есть — «без ссылки» нет', () => {
    renderRow({ linkMissing: false });

    expect(screen.queryByText('без ссылки')).not.toBeInTheDocument();
  });

  it('«→ каналы» печатается тихой строкой, предупреждение — цветом опасности (ADR-0191)', () => {
    const { unmount } = renderRow({
      destination: { text: '→ Тайцзи вечер, Ученики', isWarning: false },
    });
    expect(screen.getByText('→ Тайцзи вечер, Ученики')).not.toHaveStyle({
      color: 'var(--danger)',
    });
    unmount();

    renderRow({
      destination: { text: 'Никуда не уходит — выберите канал', isWarning: true },
    });
    expect(screen.getByText('Никуда не уходит — выберите канал')).toHaveStyle({
      color: 'var(--danger)',
    });
  });

  it('строки назначения нет — ничего лишнего, пометки «без каналов» тоже нет', () => {
    renderRow({ destination: null });

    expect(screen.queryByText(/→|Никуда|без каналов/)).not.toBeInTheDocument();
  });

  it('обе беды сразу — обе пометки, и пустой строки пометок без причины нет', () => {
    const { container, rerender } = renderRow({
      active: false,
      linkMissing: true,
    });

    expect(screen.getByText('выключено')).toBeInTheDocument();
    expect(screen.getByText('без ссылки')).toBeInTheDocument();
    expect(container.querySelectorAll('.xuanxue-status-label')).toHaveLength(2);

    rerender(<SlotRow slot={makeSlot()} onSelect={vi.fn()} />);
    expect(container.querySelectorAll('.xuanxue-status-label')).toHaveLength(0);
  });
});

describe('SlotRow — «раз в 2 недели» (ADR-0168)', () => {
  it('слот раз в две недели — тихая строка сразу под местом', () => {
    renderRow({ isBiweekly: true });

    const note = screen.getByText('раз в 2 недели');
    expect(note.previousElementSibling).toHaveTextContent('Онлайн');
  });

  it('еженедельный слот — подписи нет', () => {
    renderRow({ isBiweekly: false });

    expect(screen.queryByText(/раз в 2 недели/)).not.toBeInTheDocument();
  });

  it('подпись не красная и не в списке пометок о проблемах: это ритм, а не беда', () => {
    const { container } = renderRow({ isBiweekly: true });

    expect(screen.getByText('раз в 2 недели')).not.toHaveStyle({
      color: 'var(--danger)',
    });
    expect(container.querySelectorAll('.xuanxue-status-label')).toHaveLength(0);
  });
});

describe('SlotRow — действие', () => {
  it('вся строка — одна кнопка, клик вызывает onSelect', async () => {
    const onSelect = vi.fn();
    renderRow({}, onSelect);

    await userEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('цель нажатия не ниже 44px (CLAUDE.md «Доступность»)', () => {
    renderRow();

    expect(screen.getByRole('button')).toHaveStyle({ minHeight: '44px' });
  });
});

// Отзыв владельца 2026-09-19 со снимка «Расписания»: длинные названия
// налезали на край карточки, время шло старостильными цифрами антиквы. Обе
// причины были в стилях строки — гейты от возврата (ADR-0043).
describe('SlotRow — облик после отзыва 2026-09-19', () => {
  it('начало и конец — текстовым шрифтом с ровными цифрами, не антиквой', () => {
    renderRow({ startTime: '08:00', endTime: '09:00' });

    for (const time of [screen.getByText('08:00'), screen.getByText('09:00')]) {
      expect(time.style.fontFamily).toBe('');
      expect(time.style.fontVariantNumeric).toBe('tabular-nums');
    }
  });

  it('длинное название рвётся, а не вылезает за карточку дня', () => {
    renderRow({ title: 'Ицзиньцзин и Бадуаньцзинь', groupLabel: '' });

    expect(screen.getByText('Ицзиньцзин и Бадуаньцзинь').style.overflowWrap).toBe(
      'anywhere',
    );
  });

  it('длинный адрес рвётся внутри строки места', () => {
    renderRow({ format: 'offline', location: 'Аркави 3, Тель-Авив' });

    const place = screen.getByText('Аркави 3, Тель-Авив').parentElement;
    expect(place?.style.overflowWrap).toBe('anywhere');
  });

  // ADR-0072: тег курса — свободный текст без верхнего предела на длину слова,
  // колонка дня узкая — подпись с тегами рвётся тем же приёмом, что и название.
  it('длинный тег рвётся внутри подписи, а не вылезает за карточку', () => {
    renderRow({ tags: ['начинающие'] });

    expect(screen.getByText(/начинающие/).style.overflowWrap).toBe('anywhere');
  });
});
