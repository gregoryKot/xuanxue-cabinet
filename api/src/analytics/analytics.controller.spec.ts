import type { ConfigService } from '@nestjs/config';
import { AnalyticsController } from './analytics.controller';

function fakeConfig(posthogKey?: string): ConfigService {
  return { get: () => posthogKey } as unknown as ConfigService;
}

describe('AnalyticsController.getConfig', () => {
  it('без POSTHOG_KEY — posthogKey: null', () => {
    const controller = new AnalyticsController(fakeConfig(undefined));
    expect(controller.getConfig()).toEqual({ posthogKey: null });
  });

  it('с POSTHOG_KEY — отдаёт его как есть', () => {
    const controller = new AnalyticsController(fakeConfig('phc_example'));
    expect(controller.getConfig()).toEqual({ posthogKey: 'phc_example' });
  });
});
