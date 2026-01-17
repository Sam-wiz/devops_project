import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  jobType: string;

  @IsObject()
  payload: Record<string, any>;
}
