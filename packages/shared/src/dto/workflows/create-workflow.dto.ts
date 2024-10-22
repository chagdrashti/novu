import { WorkflowCreationSourceEnum } from '../../types';
import { PreferencesRequestDto, StepCreateDto, WorkflowCommonsFields } from './workflow-response.dto';

export type CreateWorkflowDto = WorkflowCommonsFields & {
  steps: StepCreateDto[];

  __source: WorkflowCreationSourceEnum;

  preferences?: PreferencesRequestDto;
};
