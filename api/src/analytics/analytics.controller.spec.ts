import type { ConfigService } from '@nestjs/config';
import { AnalyticsController } from './analytics.controller';

function fakeConfig(posthogKey?: string): ConfigService {
  return { get: () => posthogKey } as unknown as ConfigService;
}

describe('AnalyticsController.getConfig', () => {
  it('без POSTHOG_KEY — posthogKey: null', async () => {
    const controller = new AnalyticsController(fakeConfig(undefined));
    await expect(controller.getConfig()).resolves.toEqual({ posthogKey: null });
  });

  it('с POSTHOG_KEY — отдаёт его как есть', async () => {
    const controller = new AnalyticsController(fakeConfig('phc_example'));
    await expect(controller.getConfig()).resolves.toEqual({
      posthogKey: 'phc_example',
    });
  });
});
