import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ExamsSectionStats } from './ExamsSectionStats';

function renderStats(
  queueCount: number | null,
  strugglingCount: number | null,
  imagesSummary: string | null = null,
  presetsCount: number | null = null,
) {
  return render(
    <MemoryRouter>
      <ExamsSectionStats
        queueCount={queueCount}
        strugglingCount={strugglingCount}
        imagesSummary={imagesSummary}
        presetsCount={presetsCount}
      />
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

describe('ExamsSectionStats — вопросы', () => {
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

  it('ссылка на вопросы ведёт на /exam-items', () => {
    renderStats(null, 0);

    expect(screen.getByRole('link', { name: 'Открыть вопросы' })).toHaveAttribute(
      'href',
      '/exam-items',
    );
  });
});

describe('ExamsSectionStats — картинки вариантов ответа (ADR-0035)', () => {
  it('imagesSummary — null (чистая база, загрузка или сбой) — строки нет', () => {
    renderStats(null, 0, null);

    expect(screen.queryByText(/Картинок к вопросам/)).not.toBeInTheDocument();
  });

  it('imagesSummary есть — строка видна под объяснением вопросов', () => {
    renderStats(null, 0, 'Картинок к вопросам: 12 — 3,4 МБ');

    expect(screen.getByText('Картинок к вопросам: 12 — 3,4 МБ')).toBeInTheDocument();
  });
});

describe('ExamsSectionStats — заготовки комментариев (ADR-0041)', () => {
  it('число ещё не пришло — общий текст, без цифры', () => {
    renderStats(null, null, null, null);

    expect(
      screen.getByText('Готовые фразы для комментария при проверке.'),
    ).toBeInTheDocument();
  });

  it('заготовок пока нет — честный текст, не «0»', () => {
    renderStats(null, null, null, 0);

    expect(
      screen.getByText('Пока нет заготовок — добавьте первую на карточке проверки.'),
    ).toBeInTheDocument();
  });

  it('заготовки есть — число дописано к тексту', () => {
    renderStats(null, null, null, 3);

    expect(screen.getByText('3 заготовки для комментария.')).toBeInTheDocument();
  });
});
