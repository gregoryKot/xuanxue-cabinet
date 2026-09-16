// Шапка раздела (components/ScreenHeader.tsx) — три необязательных куска
// дают четыре сочетания, и ветки проверяются здесь, а не в каждом экране,
// который её рисует (CLAUDE.md «Тесты»: ветвление = логика).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScreenHeader } from './ScreenHeader';

describe('ScreenHeader', () => {
  it('заголовок раздела — h1, под ним объяснение', () => {
    render(<ScreenHeader title="Занятия" explanation="Занятия на 4 недели вперёд." />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Занятия' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Занятия на 4 недели вперёд.')).toBeInTheDocument();
  });

  it('приписка и действие рисуются, когда их передали', () => {
    render(
      <ScreenHeader
        title="Расписание"
        explanation="Постоянные занятия недели."
        hint="Время в сетке — по часам школы (Asia/Jerusalem)."
        action={<button type="button">Добавить занятие</button>}
      />,
    );

    expect(
      screen.getByText('Время в сетке — по часам школы (Asia/Jerusalem).'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить занятие' })).toBeInTheDocument();
  });

  it('пояс совпал с браузерным (hint=null) — лишней строки нет', () => {
    render(
      <ScreenHeader title="Расписание" explanation="Постоянные занятия." hint={null} />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
