// Пилюли-ссылки тега на карточках (ADR-0075) — рендер, href на экран тега,
// кодирование тега со слэшем, пустой список — строки нет вовсе.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TagPillLinks } from './TagPillLinks';

function renderPills(tags: readonly string[]) {
  return render(
    <MemoryRouter>
      <TagPillLinks tags={tags} groupLabel="Теги материала" />
    </MemoryRouter>,
  );
}

describe('TagPillLinks', () => {
  it('без тегов — строки нет вовсе', () => {
    const { container } = renderPills([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('каждый тег — своя ссылка-пилюля на экран тега с этим тегом', () => {
    renderPills(['дракон', 'начинающие']);

    expect(screen.getByRole('group', { name: 'Теги материала' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'дракон' })).toHaveAttribute(
      'href',
      `/materials/tags?tag=${encodeURIComponent('дракон')}`,
    );
    expect(screen.getByRole('link', { name: 'начинающие' })).toHaveAttribute(
      'href',
      `/materials/tags?tag=${encodeURIComponent('начинающие')}`,
    );
  });

  it('тег со слэшем — кодируется в адресе ссылки', () => {
    renderPills(['ушу/тайцзи']);

    const link = screen.getByRole('link', { name: 'ушу/тайцзи' });
    expect(link).toHaveAttribute(
      'href',
      `/materials/tags?tag=${encodeURIComponent('ушу/тайцзи')}`,
    );
    expect(link.getAttribute('href')).not.toContain('ушу/тайцзи');
  });
});
