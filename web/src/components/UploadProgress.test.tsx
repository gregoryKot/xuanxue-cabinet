import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadProgress, pendingLabel } from './UploadProgress';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pendingLabel', () => {
  it('без прогресса — просто «Загружаем…»', () => {
    expect(pendingLabel(null)).toBe('Загружаем…');
  });

  it('с прогрессом — процент округлён и приписан через пробел', () => {
    expect(pendingLabel(0.365)).toBe('Загружаем… 37 %');
    expect(pendingLabel(1)).toBe('Загружаем… 100 %');
  });
});

describe('UploadProgress', () => {
  it('процент в подписи, <progress> с тем же значением и просьба не уходить', () => {
    render(<UploadProgress progress={0.37} />);

    expect(screen.getByText('Загружаем… 37 %')).toBeInTheDocument();
    expect(document.querySelector('progress')).toHaveAttribute('value', '0.37');
    expect(screen.getByText(/Не закрывайте страницу/)).toBeInTheDocument();
  });

  it('доля неизвестна — без числа и без полоски', () => {
    render(<UploadProgress progress={null} />);

    expect(screen.getByText('Загружаем…')).toBeInTheDocument();
    expect(document.querySelector('progress')).not.toBeInTheDocument();
  });

  it('пока показан — уход со страницы спрашивает подтверждение', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const { unmount } = render(<UploadProgress progress={0.5} />);
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    const remove = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});
