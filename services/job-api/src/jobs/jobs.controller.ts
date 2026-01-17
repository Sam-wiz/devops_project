import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * POST /jobs
   * Accepts a job submission, validates it, and publishes to RabbitMQ
   * Returns 202 Accepted immediately
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createJob(@Body() createJobDto: CreateJobDto) {
    await this.jobsService.publishJob(createJobDto);
    return {
      status: 'accepted',
      message: 'Job queued for processing',
      jobType: createJobDto.jobType,
    };
  }
}
