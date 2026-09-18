import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatNumber } from './StatNumber';

describe('StatNumber', () => {
  it('рисует число и подпись', () => {
    render(<StatNumber value={3} label="работы учеников" />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('работы учеников')).toBeInTheDocument();
  });

  // Число и подпись — одна пара, а не два текста, случайно оказавшихся
  // рядом: подпись должна жить в одной обёртке с числом, иначе вёрстка может
  // развести их по разным контейнерам и разрушить связь на экране.
  it('подпись — в одной обёртке с числом, не два независимых текста', () => {
    render(<StatNumber value={3} label="работы учеников" />);

    const value = screen.getByText('3');
    const label = screen.getByText('работы учеников');
    expect(label.parentElement).toBe(value.parentElement);
  });

  // Ноль — тоже число: решение, показывать его или текст-заглушку, остаётся
  // у экрана (у «Экзаменов» — ветка `queueCount ? … : …`), а не должно тихо
  // съедаться самим компонентом.
  it('ноль отрисовывается как «0», а не пропадает', () => {
    render(<StatNumber value={0} label="ошибок доставки" />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('style переопределяет разметку обёртки — строка по базовой линии у «Экзаменов»', () => {
    render(<StatNumber value={3} label="работы" style={{ flexDirection: 'row' }} />);

    expect(screen.getByText('3').parentElement?.style.flexDirection).toBe('row');
  });

  it('labelStyle переопределяет вид подписи — ссылка «Отменено автоматикой»', () => {
    render(
      <StatNumber
        value={5}
        label="Отменено автоматикой"
        labelStyle={{ borderBottom: '1px solid var(--control-border)' }}
      />,
    );

    expect(screen.getByText('Отменено автоматикой').style.borderBottom).toBe(
      '1px solid var(--control-border)',
    );
  });
});
