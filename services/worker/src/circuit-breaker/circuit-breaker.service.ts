import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownPeriod: number; // seconds
}

interface CircuitBreakerData {
  state: CircuitState;
  openedAt?: number;
}

@Injectable()
export class CircuitBreakerService implements OnModuleInit, OnModuleDestroy {
  private redisClient: RedisClientType;
  private readonly config: CircuitBreakerConfig;

  constructor() {
    this.config = {
      failureThreshold: parseInt(process.env.FAILURE_THRESHOLD || '5', 10),
      cooldownPeriod: parseInt(process.env.COOLDOWN_PERIOD || '60', 10),
    };
  }

  async onModuleInit() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    this.redisClient.on('error', (err) => console.error('Redis error:', err));
    await this.redisClient.connect();
    console.log('Circuit Breaker connected to Redis');
  }

  async onModuleDestroy() {
    await this.redisClient?.quit();
  }

  /**
   * Increment failure counter for a specific jobType and errorCode
   * Returns the new failure count
   */
  async incrementFailure(jobType: string, errorCode: string): Promise<number> {
    const key = `failure:${jobType}:${errorCode}`;
    const count = await this.redisClient.incr(key);

    // Set TTL on first increment to auto-cleanup old counters
    if (count === 1) {
      await this.redisClient.expire(key, 3600); // 1 hour TTL
    }

    console.log(`Failure count for ${jobType}:${errorCode} = ${count}`);
    return count;
  }

  /**
   * Check if failure count exceeds threshold
   */
  async shouldOpenCircuit(jobType: string, errorCode: string): Promise<boolean> {
    const key = `failure:${jobType}:${errorCode}`;
    const count = await this.redisClient.get(key);
    return parseInt(count || '0', 10) >= this.config.failureThreshold;
  }

  /**
   * Open circuit breaker for a jobType
   */
  async openCircuit(jobType: string): Promise<void> {
    const key = `breaker:${jobType}`;
    const data: CircuitBreakerData = {
      state: CircuitState.OPEN,
      openedAt: Date.now(),
    };

    await this.redisClient.set(key, JSON.stringify(data));
    console.log(`Circuit OPENED for jobType: ${jobType}`);
  }

  /**
   * Close circuit breaker for a jobType
   */
  async closeCircuit(jobType: string): Promise<void> {
    const key = `breaker:${jobType}`;
    const data: CircuitBreakerData = {
      state: CircuitState.CLOSED,
    };

    await this.redisClient.set(key, JSON.stringify(data));

    // Reset failure counters when circuit closes
    const pattern = `failure:${jobType}:*`;
    const keys = await this.redisClient.keys(pattern);
    if (keys.length > 0) {
      await this.redisClient.del(keys);
    }

    console.log(`Circuit CLOSED for jobType: ${jobType}`);
  }

  /**
   * Get circuit breaker state for a jobType
   */
  async getCircuitState(jobType: string): Promise<CircuitState> {
    const key = `breaker:${jobType}`;
    const data = await this.redisClient.get(key);

    if (!data) {
      return CircuitState.CLOSED;
    }

    const breaker: CircuitBreakerData = JSON.parse(data);

    // Check if cooldown period has elapsed
    if (breaker.state === CircuitState.OPEN && breaker.openedAt) {
      const elapsed = (Date.now() - breaker.openedAt) / 1000;
      if (elapsed >= this.config.cooldownPeriod) {
        console.log(`Cooldown elapsed for ${jobType}, ready for probe`);
        // Don't auto-close; let a successful probe close it
      }
    }

    return breaker.state;
  }

  /**
   * Check if cooldown period has elapsed (ready for probe test)
   */
  async canProbe(jobType: string): Promise<boolean> {
    const key = `breaker:${jobType}`;
    const data = await this.redisClient.get(key);

    if (!data) {
      return false;
    }

    const breaker: CircuitBreakerData = JSON.parse(data);

    if (breaker.state === CircuitState.OPEN && breaker.openedAt) {
      const elapsed = (Date.now() - breaker.openedAt) / 1000;
      return elapsed >= this.config.cooldownPeriod;
    }

    return false;
  }

  /**
   * Get all circuit breakers (for control plane)
   */
  async getAllBreakers(): Promise<Record<string, CircuitBreakerData>> {
    const pattern = 'breaker:*';
    const keys = await this.redisClient.keys(pattern);
    const breakers: Record<string, CircuitBreakerData> = {};

    for (const key of keys) {
      const data = await this.redisClient.get(key);
      if (data) {
        const jobType = key.replace('breaker:', '');
        breakers[jobType] = JSON.parse(data);
      }
    }

    return breakers;
  }
}
