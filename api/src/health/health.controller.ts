import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { ConnectionStates, type Connection } from 'mongoose';
import pkg from '../../package.json';

export interface HealthStatus {
  status: 'ok';
  version: string;
  mongo: 'up' | 'down';
  uptimeSec: number;
}

// Вне троттлинга и вне автологов nestjs-pino (см. logging.module.ts) —
// Railway и мониторинг дёргают этот путь каждую минуту.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      version: pkg.version,
      mongo: this.connection.readyState === ConnectionStates.connected ? 'up' : 'down',
      uptimeSec: Math.floor(process.uptime()),
    };
  }
}
