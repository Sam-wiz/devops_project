import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext, ClientProxy } from '@nestjs/microservices';
import { WorkerService, JobMessage } from './worker.service';

@Controller()
export class WorkerController {
  constructor(
    private readonly workerService: WorkerService,
    @Inject('RABBITMQ_CLIENT') private readonly rabbitClient: ClientProxy,
  ) {}

  /**
   * Consume jobs from jobs.main queue
   * Pattern: job.created
   */
  @MessagePattern('job.created')
  async handleJob(@Payload() job: JobMessage, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    console.log(`Received job: ${job.jobType}`);

    try {
      // Process the job
      const result = await this.workerService.processJob(job);

      // Determine routing based on result
      const decision = await this.workerService.getRoutingDecision(job, result);

      console.log(`Routing decision: ${decision.route} - ${decision.reason}`);

      switch (decision.route) {
        case 'ack':
          // Success - acknowledge and remove from queue
          channel.ack(originalMsg);
          console.log(`Job ${job.jobType} acknowledged (success)`);
          break;

        case 'retry': {
          // Retry - publish to retry queue with incremented attempt count
          const retryJob = {
            ...job,
            metadata: {
              ...job.metadata,
              attemptCount: job.metadata.attemptCount + 1,
            },
          };

          this.rabbitClient.emit('job.retry', retryJob);
          channel.ack(originalMsg); // Ack original message
          console.log(`Job ${job.jobType} sent to retry queue`);
          break;
        }

        case 'quarantine': {
          // Quarantine - publish to quarantine queue
          const quarantineJob = {
            ...job,
            quarantineReason: decision.reason,
            quarantinedAt: new Date().toISOString(),
          };

          this.rabbitClient.emit('job.quarantine', quarantineJob);
          channel.ack(originalMsg); // Ack original message
          console.log(`Job ${job.jobType} quarantined: ${decision.reason}`);
          break;
        }
      }
    } catch (error) {
      console.error(`Error handling job: ${error.message}`);
      // On unexpected error, nack and requeue (will hit DLQ after retries)
      channel.nack(originalMsg, false, false);
    }
  }

  /**
   * Consume jobs from jobs.retry queue
   * These are jobs being retried after initial failure
   */
  @MessagePattern('job.retry')
  async handleRetryJob(@Payload() job: JobMessage, @Ctx() context: RmqContext) {
    console.log(`Processing retry job: ${job.jobType}, attempt: ${job.metadata.attemptCount}`);

    // Re-process through the same logic
    await this.handleJob(job, context);
  }
}
