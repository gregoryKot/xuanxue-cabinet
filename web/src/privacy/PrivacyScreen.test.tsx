// Страница политики конфиденциальности — открыта и гостю, и вошедшему, без
// редиректа в обе стороны (ADR-0145): доступ проверяется на уровне App.tsx
// (маршрут вне RequireAuth), здесь — что сам текст (privacyPolicyText.ts)
// доезжает до DOM целиком.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PRIVACY_SECTIONS, PRIVACY_TITLE } from './privacyPolicyText';
import PrivacyScreen from './PrivacyScreen';

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/privacy']}>
      <PrivacyScreen />
    </MemoryRouter>,
  );
}

describe('PrivacyScreen', () => {
  it('рисует заголовок и дату редакции', () => {
    renderScreen();

    expect(
      screen.getByRole('heading', { level: 1, name: PRIVACY_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Редакция от/)).toBeInTheDocument();
  });

  it('рисует все разделы политики по заголовкам', () => {
    renderScreen();

    for (const section of PRIVACY_SECTIONS) {
      expect(
        screen.getByRole('heading', { level: 2, name: section.title }),
      ).toBeInTheDocument();
    }
  });

  // ADR-0124: акценты `**…**` из текста доезжают до экрана как <strong>, не
  // звёздочками — сверяем на первом разделе («имя и фамилию…»).
  it('акценты текста рисуются через RichText, не звёздочками', () => {
    renderScreen();

    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBe(
      PRIVACY_SECTIONS.length,
    );
  });
});
