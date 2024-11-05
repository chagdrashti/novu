import { IsArray, IsBoolean, IsDefined, IsOptional, IsString } from 'class-validator';
import { WorkflowResponseDto } from './workflow-response-dto';
import { Slug, StepTypeEnum, WorkflowPreferences } from '../../types';
import { StepContentIssueEnum } from '../step-schemas';
import { StepIssueEnum } from '../step-schemas/step-content-issue.enum';
export class ControlsSchema {
  schema: JSONSchema;
}
export type StepCreateAndUpdateKeys = keyof StepCreateDto | keyof StepUpdateDto;

export class StepIssuesDto {
  body?: Record<StepCreateAndUpdateKeys, StepIssue>;
  controls?: Record<string, ControlPreviewIssue[]>;
}
export class ControlPreviewIssue {
  issueType: StepContentIssueEnum;
  variableName?: string;
  message: string;
}
export class StepIssue {
  issueType: StepIssueEnum;
  variableName?: string;
  message: string;
}
export type IdentifierOrInternalId = string;

export type StepResponseDto = StepDto & {
  _id: string;
  slug: Slug;
  stepId: string;
  issues: StepIssuesDto;
};

export type StepUpdateDto = StepCreateDto & {
  _id: string;
};

export type StepCreateDto = StepDto & {
  controlValues?: Record<string, unknown>;
};

export type ListWorkflowResponse = {
  workflows: WorkflowListResponseDto[];
  totalCount: number;
};

export type WorkflowListResponseDto = Pick<
  WorkflowResponseDto,
  'name' | 'tags' | 'updatedAt' | 'createdAt' | '_id' | 'workflowId' | 'slug' | 'status' | 'origin'
> & {
  stepTypeOverviews: StepTypeEnum[];
};

export class StepDto {
  @IsString()
  @IsDefined()
  name: string;

  @IsString()
  @IsDefined()
  type: StepTypeEnum;
}

export class WorkflowCommonsFields {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export type PreferencesResponseDto = {
  user: WorkflowPreferences | null;
  default: WorkflowPreferences;
};

export type PreferencesRequestDto = {
  user: WorkflowPreferences | null;
  workflow?: WorkflowPreferences | null;
};
