import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ExamsSectionStats } from './ExamsSectionStats';

function renderStats(queueCount: number | null, strugglingCount: number | null) {
  return render(
    <MemoryRouter>
      <ExamsSectionStats queueCount={queueCount} strugglingCount={strugglingCount} />
    </MemoryRouter>,
  );
}

describe('ExamsSectionStats — очередь проверки', () => {
  it('число ещё не пришло — общий текст, без цифры', () => {
    renderStats(null, null);

    expect(
      screen.getByText('Сданные работы, которые ждут вашей оценки.'),
    ).toBeInTheDocument();
  });

  it('очередь пуста — честный текст, не «0»', () => {
    renderStats(0, null);

    expect(screen.getByText('Пока нечего проверять.')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('есть работы — крупная цифра и подпись рядом', () => {
    renderStats(3, null);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('работы учеников')).toBeInTheDocument();
  });

  it('ссылка на очередь ведёт на /grading', () => {
    renderStats(1, null);

    expect(screen.getByRole('link', { name: 'Открыть очередь' })).toHaveAttribute(
      'href',
      '/grading',
    );
  });
});

describe('ExamsSectionStats — банк вопросов', () => {
  it('без спотыкающихся вопросов — только объяснение раздела', () => {
    renderStats(null, 0);

    expect(
      screen.getByText(
        'Из них собирается экзамен — один вопрос можно поставить в несколько экзаменов.',
      ),
    ).toBeInTheDocument();
  });

  it('есть спотыкающиеся вопросы — число дописано к тексту', () => {
    renderStats(null, 2);

    expect(
      screen.getByText(/2 вопроса путают больше половины ответивших\./),
    ).toBeInTheDocument();
  });

  it('ссылка на банк ведёт на /exam-items', () => {
    renderStats(null, 0);

    expect(screen.getByRole('link', { name: 'Открыть банк' })).toHaveAttribute(
      'href',
      '/exam-items',
    );
  });
});
