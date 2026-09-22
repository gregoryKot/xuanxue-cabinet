// Раскрывающаяся инструкция у формы ссылки (ADR-0084) — сеть тут ни при чём,
// компонент только состояние open/close, тот же приём, что
// DeliveryCard.test.tsx для «Показать текст».
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AttemptVideoHowTo } from './AttemptVideoHowTo';

const TOGGLE_NAME = 'Как выложить видео, чтобы учитель его открыл';

describe('AttemptVideoHowTo', () => {
  it('свёрнут по умолчанию — текста инструкции в документе нет', () => {
    render(<AttemptVideoHowTo />);

    expect(screen.getByRole('button', { name: TOGGLE_NAME })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText(/YouTube\. В настройках доступа/)).not.toBeInTheDocument();
  });

  // CLAUDE.md «Доступность»: ревью с клавиатуры — раскрытие тоже должно
  // работать без мыши, а не только по клику.
  it('раскрывается с клавиатуры — видны YouTube, ВКонтакте, другие сервисы и ошибка', async () => {
    const user = userEvent.setup();
    render(<AttemptVideoHowTo />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: TOGGLE_NAME })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(/YouTube\. В настройках доступа/)).toBeInTheDocument();
    expect(screen.getByText(/ВКонтакте\. Загрузите видео/)).toBeInTheDocument();
    expect(screen.getByText(/Rutube, Яндекс\.Диск, Облако Mail\.ru/)).toBeInTheDocument();
    expect(
      screen.getByText(/Проверьте ссылку в окне, где вы не вошли в свой аккаунт/),
    ).toBeInTheDocument();
  });

  it('повторное нажатие закрывает блок', async () => {
    const user = userEvent.setup();
    render(<AttemptVideoHowTo />);
    const toggle = screen.getByRole('button', { name: TOGGLE_NAME });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/YouTube\. В настройках доступа/)).not.toBeInTheDocument();
  });
});
