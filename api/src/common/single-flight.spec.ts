// Аудит 2026-10-01 (F02): N параллельных чтений одного видео — одна работа.
import { SingleFlight } from './single-flight';

describe('SingleFlight', () => {
  it('параллельные вызовы с одним ключом — одна работа, один результат на всех', async () => {
    const flight = new SingleFlight<number>();
    let resolveWork: (value: number) => void = () => undefined;
    const work = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveWork = resolve;
        }),
    );

    const calls = [flight.run('a', work), flight.run('a', work), flight.run('a', work)];
    resolveWork(42);

    await expect(Promise.all(calls)).resolves.toEqual([42, 42, 42]);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('разные ключи — независимые работы', async () => {
    const flight = new SingleFlight<string>();
    const work = jest.fn((value: string) => () => Promise.resolve(value));

    await expect(
      Promise.all([flight.run('a', work('A')), flight.run('b', work('B'))]),
    ).resolves.toEqual(['A', 'B']);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('после завершения следующий вызов запускает работу заново', async () => {
    const flight = new SingleFlight<number>();
    const work = jest.fn().mockResolvedValue(1);

    await flight.run('a', work);
    await flight.run('a', work);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it('сбой не залипает: все летящие получают отказ, следующий вызов пробует снова', async () => {
    const flight = new SingleFlight<number>();
    const work = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error('R2 упал'))
      .mockResolvedValueOnce(7);

    const first = flight.run('a', work);
    const second = flight.run('a', work);
    await expect(first).rejects.toThrow('R2 упал');
    await expect(second).rejects.toThrow('R2 упал');

    await expect(flight.run('a', work)).resolves.toBe(7);
    expect(work).toHaveBeenCalledTimes(2);
  });
});
