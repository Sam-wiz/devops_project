import { Injectable } from '@nestjs/common';
import { CircuitBreakerService, CircuitState } from '../circuit-breaker/circuit-breaker.service';
import { EmailService } from '../email/email.service';

export interface JobMessage {
  jobType: string;
  payload: Record<string, any>;
  metadata: {
    submittedAt: string;
    attemptCount: number;
  };
}

export interface JobExecutionResult {
  success: boolean;
  errorCode?: string;
  message?: string;
}

@Injectable()
export class WorkerService {
  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Main job processing logic
   * This is where actual job execution happens (mocked for this demo)
   */
  async processJob(job: JobMessage): Promise<JobExecutionResult> {
    console.log(`Processing job: ${job.jobType}, attempt: ${job.metadata.attemptCount}`);

    try {
      // Check circuit breaker state before processing
      const circuitState = await this.circuitBreaker.getCircuitState(job.jobType);

      if (circuitState === CircuitState.OPEN) {
        const canProbe = await this.circuitBreaker.canProbe(job.jobType);

        if (!canProbe) {
          console.log(`Circuit OPEN for ${job.jobType}, skipping job`);
          return {
            success: false,
            errorCode: 'CIRCUIT_OPEN',
            message: 'Circuit breaker is open, job not processed',
          };
        } else {
          console.log(`Circuit OPEN but cooldown elapsed, probing with job ${job.jobType}`);
        }
      }

      // Mock job execution logic
      const result = await this.executeJobLogic(job);

      if (result.success) {
        // On success, close circuit if it was open
        if (circuitState === CircuitState.OPEN) {
          await this.circuitBreaker.closeCircuit(job.jobType);
          console.log(`Probe successful, circuit closed for ${job.jobType}`);
        }
      } else {
        // On failure, increment counter and check threshold
        const errorCode = result.errorCode || 'UNKNOWN_ERROR';
        const failureCount = await this.circuitBreaker.incrementFailure(job.jobType, errorCode);

        const shouldOpen = await this.circuitBreaker.shouldOpenCircuit(job.jobType, errorCode);

        if (shouldOpen && circuitState === CircuitState.CLOSED) {
          await this.circuitBreaker.openCircuit(job.jobType);
          
          // Send email alert to developer
          await this.emailService.sendCircuitOpenAlert(job.jobType, errorCode, failureCount);
        }
      }

      return result;
    } catch (error) {
      console.error(`Job processing error: ${error.message}`);
      return {
        success: false,
        errorCode: 'INTERNAL_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Mock job execution logic
   * In a real system, this would call external APIs, process data, etc.
   *
   * Simulates:
   * - 20% failure rate for demo purposes
   * - Different error codes for testing
   */
  private async executeJobLogic(job: JobMessage): Promise<JobExecutionResult> {
    // Simulate async work
    await this.delay(100 + Math.random() * 400);

    // Simulate failures based on job type for demo
    // In real world, this would be actual business logic that might fail
    const shouldFail = Math.random() < 0.2; // 20% failure rate

    if (shouldFail) {
      const errorCodes = ['API_TIMEOUT', 'VALIDATION_ERROR', 'EXTERNAL_SERVICE_ERROR'];
      const errorCode = errorCodes[Math.floor(Math.random() * errorCodes.length)];

      return {
        success: false,
        errorCode,
        message: `Mock failure: ${errorCode}`,
      };
    }

    // Success case
    console.log(`Job ${job.jobType} executed successfully`);
    return { success: true };
  }

  /**
   * Determine routing decision based on job result
   */
  async getRoutingDecision(job: JobMessage, result: JobExecutionResult): Promise<{
    route: 'ack' | 'retry' | 'quarantine';
    reason: string;
  }> {
    if (result.success) {
      return { route: 'ack', reason: 'Job completed successfully' };
    }

    if (result.errorCode === 'CIRCUIT_OPEN') {
      return { route: 'quarantine', reason: 'Circuit breaker is open' };
    }

    const circuitState = await this.circuitBreaker.getCircuitState(job.jobType);
    const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);

    // If circuit is open or max retries exceeded, quarantine
    if (circuitState === CircuitState.OPEN || job.metadata.attemptCount >= maxRetries) {
      return {
        route: 'quarantine',
        reason: circuitState === CircuitState.OPEN
          ? 'Circuit breaker opened due to repeated failures'
          : 'Max retries exceeded',
      };
    }

    // Otherwise, retry
    return {
      route: 'retry',
      reason: `Retry attempt ${job.metadata.attemptCount + 1}/${maxRetries}`,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
