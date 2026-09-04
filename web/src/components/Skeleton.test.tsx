import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonList } from './Skeleton';

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
