import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OptionImage } from './OptionImage';

describe('OptionImage', () => {
  it('src — адрес картинки по её id, alt — переданный текст', () => {
    render(
      <OptionImage
        imageId="652f00000000000000000001"
        alt="Картинка варианта 1"
        size="thumb"
      />,
    );

    const img = screen.getByRole('img', { name: 'Картинка варианта 1' });
    expect(img).toHaveAttribute('src', '/api/exam-images/652f00000000000000000001');
  });

  it('tile — картинка вписывается в высоту плитки (maxHeight: 100%), не в свой пиксельный потолок', () => {
    render(<OptionImage imageId="i1" alt="Вариант 1" size="tile" />);

    expect(screen.getByRole('img')).toHaveStyle({ maxHeight: '100%' });
  });
});
