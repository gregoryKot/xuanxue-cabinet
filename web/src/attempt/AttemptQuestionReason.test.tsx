// Поле объяснения выбора (ADR-0146) — видимая подпись, значение, подсветка
// «не написано» и передача ввода наружу.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttemptQuestionReason } from './AttemptQuestionReason';

describe('AttemptQuestionReason', () => {
  it('видимая подпись «Объясните свой ответ» связана с полем', () => {
    render(
      <AttemptQuestionReason
        itemId="q1"
        value=""
        onChange={() => {}}
        onBlur={() => {}}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Объясните свой ответ' }),
    ).toBeInTheDocument();
  });

  it('правка поля зовёт onChange с новым текстом', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AttemptQuestionReason
        itemId="q1"
        value=""
        onChange={onChange}
        onBlur={() => {}}
      />,
    );

    await user.type(screen.getByRole('textbox'), 'т');

    expect(onChange).toHaveBeenCalledWith('т');
  });

  it('уход с поля (blur) зовёт onBlur', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    render(
      <AttemptQuestionReason
        itemId="q1"
        value="текст"
        onChange={() => {}}
        onBlur={onBlur}
      />,
    );

    await user.click(screen.getByRole('textbox'));
    await user.tab();

    expect(onBlur).toHaveBeenCalled();
  });

  it('invalid — aria-invalid на поле', () => {
    render(
      <AttemptQuestionReason
        itemId="q1"
        value=""
        invalid
        onChange={() => {}}
        onBlur={() => {}}
      />,
    );

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('без invalid — aria-invalid не проставлен', () => {
    render(
      <AttemptQuestionReason
        itemId="q1"
        value=""
        onChange={() => {}}
        onBlur={() => {}}
      />,
    );

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid');
  });

  it('disabled — поле выключено, показывает переданный текст', () => {
    render(
      <AttemptQuestionReason
        itemId="q1"
        value="объяснение ученика"
        disabled
        onChange={() => {}}
        onBlur={() => {}}
      />,
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveValue('объяснение ученика');
  });

  it('подпись id зависит от itemId — два вопроса не путают подписи', () => {
    render(
      <>
        <AttemptQuestionReason
          itemId="q1"
          value=""
          onChange={() => {}}
          onBlur={() => {}}
        />
        <AttemptQuestionReason
          itemId="q2"
          value=""
          onChange={() => {}}
          onBlur={() => {}}
        />
      </>,
    );

    expect(screen.getAllByRole('textbox', { name: 'Объясните свой ответ' })).toHaveLength(
      2,
    );
  });
});
