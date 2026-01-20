import { Test, TestingModule } from '@nestjs/testing';
import { WorkerService } from './worker.service';
import { CircuitBreakerService, CircuitState } from '../circuit-breaker/circuit-breaker.service';
import { EmailService } from '../email/email.service';

describe('WorkerService', () => {
  let service: WorkerService;
  let mockCircuitBreaker: any;
  let mockEmailService: any;

  beforeEach(async () => {
    mockCircuitBreaker = {
      getCircuitState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
      incrementFailure: jest.fn().mockResolvedValue(1),
      shouldOpenCircuit: jest.fn().mockResolvedValue(false),
      openCircuit: jest.fn(),
      closeCircuit: jest.fn(),
      canProbe: jest.fn().mockResolvedValue(false),
    };

    mockEmailService = {
      sendCircuitOpenAlert: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerService,
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreaker,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<WorkerService>(WorkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process job and check circuit breaker', async () => {
    const job = {
      jobType: 'email',
      payload: { to: 'test@example.com' },
      metadata: { submittedAt: '2024-01-01', attemptCount: 0 },
    };

    await service.processJob(job);

    expect(mockCircuitBreaker.getCircuitState).toHaveBeenCalledWith('email');
  });
});
