import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';
import pkg from '../../package.json';

export interface HealthStatus {
  status: 'ok';
  version: string;
  mongo: 'up' | 'down';
}

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      version: pkg.version,
      mongo: this.connection.readyState === ConnectionStates.connected ? 'up' : 'down',
    };
  }
}
