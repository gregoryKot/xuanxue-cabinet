import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoadableSection } from './LoadableSection';

const EXPLANATION = 'Оплату отмечает **школа**, когда видит перевод.';

function renderSection(error: string | null, onRetry = vi.fn()) {
  render(
    <LoadableSection
      heading="Абонемент"
      explanation={EXPLANATION}
      error={error}
      onRetry={onRetry}
    >
      <p>Содержимое раздела</p>
    </LoadableSection>,
  );
  return onRetry;
}

describe('LoadableSection', () => {
  it('заголовок-рубрика, объяснение с акцентом и содержимое; баннера без ошибки нет', () => {
    renderSection(null);

    expect(screen.getByRole('heading', { level: 2, name: 'Абонемент' })).toBeVisible();
    expect(screen.getByText('школа').tagName).toBe('STRONG');
    expect(screen.getByText('Содержимое раздела')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('сбой загрузки — баннер с текстом и повтором, содержимое остаётся на месте', async () => {
    const user = userEvent.setup();
    const onRetry = renderSection('Не удалось загрузить. Попробуйте ещё раз.');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось загрузить. Попробуйте ещё раз.',
    );
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Содержимое раздела')).toBeVisible();
  });
});
