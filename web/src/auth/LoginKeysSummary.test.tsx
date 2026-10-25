// Сводка «Способы входа» — баг владельца 2026-09-29: «Профиль» не называл
// привязанный адрес.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { LoginKeysSummary, loginKeyRows } from './LoginKeysSummary';

const BASE: MeDto = {
  id: 'u1',
  name: 'Мария Ли',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  hasEmail: false,
  googleLinked: false,
  noTelegram: false,
  needsProfile: false,
  studentMode: false,
  canUseStudentMode: false,
  homeHiddenTiles: [],
};

function valueOf(label: string): string | null {
  return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

describe('LoginKeysSummary', () => {
  it('заголовок и три строки', () => {
    render(<LoginKeysSummary me={BASE} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Способы входа' }),
    ).toBeInTheDocument();
    expect(loginKeyRows(BASE).map((r) => r.label)).toEqual([
      'Почта',
      'Telegram',
      'Google',
    ]);
  });

  it('подтверждённая почта — виден сам адрес', () => {
    render(
      <LoginKeysSummary me={{ ...BASE, email: 'maria@example.com', hasEmail: true }} />,
    );

    expect(valueOf('Почта')).toBe('maria@example.com');
  });

  it('только ждущий адрес — «не привязана», адрес не дублируется', () => {
    render(<LoginKeysSummary me={{ ...BASE, pendingEmail: 'ждёт@example.com' }} />);

    expect(valueOf('Почта')).toBe('не привязана');
    expect(screen.queryByText('ждёт@example.com')).not.toBeInTheDocument();
  });

  it('Telegram и Google — «привязан» или «нет»', () => {
    const { unmount } = render(<LoginKeysSummary me={BASE} />);
    expect(valueOf('Telegram')).toBe('нет');
    expect(valueOf('Google')).toBe('нет');
    unmount();

    render(
      <LoginKeysSummary me={{ ...BASE, telegramLinked: true, googleLinked: true }} />,
    );
    expect(valueOf('Telegram')).toBe('привязан');
    expect(valueOf('Google')).toBe('привязан');
  });
});
