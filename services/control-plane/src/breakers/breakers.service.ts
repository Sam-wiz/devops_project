import { Injectable, OnModuleInit, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
}

export interface CircuitBreakerInfo {
  jobType: string;
  state: CircuitState;
  openedAt?: number;
  cooldownElapsed?: boolean;
}

@Injectable()
export class BreakersService implements OnModuleInit, OnModuleDestroy {
  private redisClient: RedisClientType;
  private readonly cooldownPeriod: number;

  constructor() {
    this.cooldownPeriod = parseInt(process.env.COOLDOWN_PERIOD || '60', 10);
  }

  async onModuleInit() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    this.redisClient.on('error', (err) => console.error('Redis error:', err));
    await this.redisClient.connect();
    console.log('Control Plane connected to Redis');
  }

  async onModuleDestroy() {
    await this.redisClient?.quit();
  }

  /**
   * Get all circuit breakers with their current state
   */
  async getAllBreakers(): Promise<CircuitBreakerInfo[]> {
    const pattern = 'breaker:*';
    const keys = await this.redisClient.keys(pattern);
    const breakers: CircuitBreakerInfo[] = [];

    for (const key of keys) {
      const data = await this.redisClient.get(key);
      if (data) {
        const jobType = key.replace('breaker:', '');
        const breakerData = JSON.parse(data);

        const info: CircuitBreakerInfo = {
          jobType,
          state: breakerData.state,
          openedAt: breakerData.openedAt,
        };

        // Calculate if cooldown has elapsed
        if (breakerData.state === CircuitState.OPEN && breakerData.openedAt) {
          const elapsed = (Date.now() - breakerData.openedAt) / 1000;
          info.cooldownElapsed = elapsed >= this.cooldownPeriod;
        }

        breakers.push(info);
      }
    }

    return breakers;
  }

  /**
   * Reset (close) a specific circuit breaker
   */
  async resetBreaker(jobType: string): Promise<void> {
    const key = `breaker:${jobType}`;
    const exists = await this.redisClient.exists(key);

    if (!exists) {
      throw new NotFoundException(`Circuit breaker for jobType '${jobType}' not found`);
    }

    // Close the circuit
    const data = {
      state: CircuitState.CLOSED,
    };

    await this.redisClient.set(key, JSON.stringify(data));

    // Clear failure counters
    const pattern = `failure:${jobType}:*`;
    const failureKeys = await this.redisClient.keys(pattern);
    if (failureKeys.length > 0) {
      await this.redisClient.del(failureKeys);
    }

    console.log(`Circuit breaker reset for jobType: ${jobType}`);
  }
}
