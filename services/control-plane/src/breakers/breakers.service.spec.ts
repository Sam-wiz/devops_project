import { Test, TestingModule } from '@nestjs/testing';
import { BreakersService } from './breakers.service';

describe('BreakersService', () => {
  let service: BreakersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BreakersService],
    }).compile();

    service = module.get<BreakersService>(BreakersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
