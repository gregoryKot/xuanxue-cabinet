// Колонка страниц до входа (вход, приглашение, политика, «Доступность»):
// ссылка «Перейти к содержимому» стоит перед <main> и ведёт в него
// (WCAG 2.4.1, ADR-0158). Гейт против того, чтобы новая публичная страница,
// собранная в обход колонки, осталась без пропуска, — этот тест на самой
// колонке: все публичные экраны рисуются через неё.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EntryColumn } from './EntryColumn';

describe('EntryColumn — пропуск к содержимому', () => {
  it('первый Tab — на ссылке, Enter уводит фокус в <main> с содержимым страницы', async () => {
    const user = userEvent.setup();
    render(
      <EntryColumn>
        <h1>Заголовок страницы</h1>
        <button type="button">Действие</button>
      </EntryColumn>,
    );

    await user.tab();
    const skipLink = screen.getByRole('link', { name: 'Перейти к содержимому' });
    expect(skipLink).toHaveFocus();

    await user.keyboard('{Enter}');
    const main = screen.getByRole('main');
    expect(main).toHaveFocus();
    expect(main).toContainElement(
      screen.getByRole('heading', { name: 'Заголовок страницы' }),
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Действие' })).toHaveFocus();
  });

  it('ссылка стоит в документе раньше <main>', () => {
    render(<EntryColumn>Текст</EntryColumn>);

    const skipLink = screen.getByRole('link', { name: 'Перейти к содержимому' });
    const position = skipLink.compareDocumentPosition(screen.getByRole('main'));

    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
