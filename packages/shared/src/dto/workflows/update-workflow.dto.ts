import { PreferencesRequestDto, StepCreateDto, StepUpdateDto, WorkflowCommonsFields } from './workflow-response.dto';

export type UpdateWorkflowDto = WorkflowCommonsFields & {
  updatedAt: string;

  steps: (StepCreateDto | StepUpdateDto)[];

  preferences: PreferencesRequestDto;
};
