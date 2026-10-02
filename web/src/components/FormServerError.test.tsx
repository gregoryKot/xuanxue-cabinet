// Аудит 2026-10-01, F66: код обращения (requestId) ученик видит только при
// 5xx — по нему владелец находит DM и строку в «Сбоях» (RUNBOOK §4).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/http';
import { errorFrom, FormServerError } from './FormServerError';

const REQUEST_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const REQUEST_ID_LABEL = 'Код обращения';

describe('errorFrom', () => {
  it('500 с requestId — код переносится', () => {
    const error = errorFrom(
      new ApiError('Сервер не ответил.', 500, 'internal_error', undefined, REQUEST_ID),
      'запасной текст',
    );
    expect(error).toEqual({
      message: 'Сервер не ответил.',
      details: undefined,
      requestId: REQUEST_ID,
    });
  });

  it('400 с requestId — кода нет: ответ сам говорит, что делать', () => {
    const error = errorFrom(
      new ApiError('Слишком длинно.', 400, 'invalid_input', ['поле'], REQUEST_ID),
      'запасной текст',
    );
    expect(error).toEqual({
      message: 'Слишком длинно.',
      details: ['поле'],
      requestId: undefined,
    });
  });

  it('не ApiError — только запасной текст', () => {
    expect(errorFrom(new Error('boom'), 'запасной текст')).toEqual({
      message: 'запасной текст',
    });
  });
});

describe('FormServerError', () => {
  it('с requestId — строка «Код обращения» с кодом целиком', () => {
    render(
      <FormServerError
        error={{ message: 'Сервер не ответил.', requestId: REQUEST_ID }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      `${REQUEST_ID_LABEL}: ${REQUEST_ID}`,
    );
  });

  it('без requestId — строки с кодом нет', () => {
    render(<FormServerError error={{ message: 'Слишком длинно.', details: ['поле'] }} />);

    expect(screen.getByRole('alert')).not.toHaveTextContent(REQUEST_ID_LABEL);
    expect(screen.getByText('поле')).toBeInTheDocument();
  });

  it('ошибки нет — ничего не рисует', () => {
    const { container } = render(<FormServerError error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
