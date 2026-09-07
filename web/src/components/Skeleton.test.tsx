import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonGrid, SkeletonList } from './Skeleton';

describe('SkeletonList', () => {
  it('рендерит заданное число строк-плейсхолдеров', () => {
    const { container } = render(<SkeletonList rows={5} />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  });

  it('по умолчанию рендерит 4 строки', () => {
    const { container } = render(<SkeletonList />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });
});

describe('SkeletonGrid', () => {
  it('рендерит заданное число карточек-плейсхолдеров', () => {
    const { container } = render(<SkeletonGrid items={3} />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });

  it('по умолчанию рендерит 5 карточек', () => {
    const { container } = render(<SkeletonGrid />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  });
});
