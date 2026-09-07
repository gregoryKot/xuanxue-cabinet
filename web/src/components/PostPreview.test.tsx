import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostPreview } from './PostPreview';

describe('PostPreview', () => {
  it('показывает текст как есть, в <pre>', () => {
    const { container } = render(<PostPreview text={'строка1\nстрока2'} />);
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toBe('строка1\nстрока2');
  });
});
