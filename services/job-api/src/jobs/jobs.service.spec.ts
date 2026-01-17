import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  let mockRabbitClient: any;

  beforeEach(async () => {
    mockRabbitClient = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: 'RABBITMQ_SERVICE',
          useValue: mockRabbitClient,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should publish job to RabbitMQ', async () => {
    const jobDto = {
      jobType: 'email',
      payload: { to: 'test@example.com' },
    };

    await service.publishJob(jobDto);

    expect(mockRabbitClient.emit).toHaveBeenCalledWith(
      'job.created',
      expect.objectContaining({
        jobType: 'email',
        payload: { to: 'test@example.com' },
        metadata: expect.objectContaining({
          attemptCount: 0,
        }),
      }),
    );
  });
});
