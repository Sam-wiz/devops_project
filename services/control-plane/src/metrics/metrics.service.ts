import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

export interface Metrics {
  circuitBreakers: {
    total: number;
    open: number;
    closed: number;
  };
  failures: {
    byJobType: Record<string, number>;
  };
}

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private redisClient: RedisClientType;

  async onModuleInit() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    this.redisClient.on('error', (err) => console.error('Redis error:', err));
    await this.redisClient.connect();
  }

  async onModuleDestroy() {
    await this.redisClient?.quit();
  }

  /**
   * Get current metrics from Redis
   */
  async getMetrics(): Promise<Metrics> {
    // Get circuit breaker stats
    const breakerKeys = await this.redisClient.keys('breaker:*');
    let openCount = 0;
    let closedCount = 0;

    for (const key of breakerKeys) {
      const data = await this.redisClient.get(key);
      if (data) {
        const breaker = JSON.parse(data);
        if (breaker.state === 'OPEN') {
          openCount++;
        } else {
          closedCount++;
        }
      }
    }

    // Get failure counts by job type
    const failureKeys = await this.redisClient.keys('failure:*');
    const failuresByJobType: Record<string, number> = {};

    for (const key of failureKeys) {
      const parts = key.split(':');
      if (parts.length >= 2) {
        const jobType = parts[1];
        const count = await this.redisClient.get(key);
        if (!failuresByJobType[jobType]) {
          failuresByJobType[jobType] = 0;
        }
        failuresByJobType[jobType] += parseInt(count || '0', 10);
      }
    }

    return {
      circuitBreakers: {
        total: breakerKeys.length,
        open: openCount,
        closed: closedCount,
      },
      failures: {
        byJobType: failuresByJobType,
      },
    };
  }
}
