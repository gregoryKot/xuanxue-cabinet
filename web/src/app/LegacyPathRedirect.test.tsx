import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LegacyPathRedirect } from './LegacyPathRedirect';

function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="where">{`${pathname}${search}${hash}`}</p>;
}

describe('LegacyPathRedirect', () => {
  it('переносит query и hash на новый адрес', () => {
    render(
      <MemoryRouter initialEntries={['/planning?week=2#lesson-l1']}>
        <Routes>
          <Route path="/planning" element={<LegacyPathRedirect to="/schedule" />} />
          <Route path="/schedule" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where')).toHaveTextContent('/schedule?week=2#lesson-l1');
  });
});
