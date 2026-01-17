import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateJobDto } from './dto/create-job.dto';

@Injectable()
export class JobsService {
  constructor(
    @Inject('RABBITMQ_SERVICE') private readonly rabbitClient: ClientProxy,
  ) {}

  /**
   * Publishes job to RabbitMQ jobs.main queue
   * Job message includes jobType, payload, and metadata
   */
  async publishJob(jobDto: CreateJobDto): Promise<void> {
    const jobMessage = {
      ...jobDto,
      metadata: {
        submittedAt: new Date().toISOString(),
        attemptCount: 0,
      },
    };

    // Publish to jobs.main queue (fire-and-forget pattern)
    this.rabbitClient.emit('job.created', jobMessage);

    console.log(`Job published: ${jobDto.jobType}`);
  }
}
