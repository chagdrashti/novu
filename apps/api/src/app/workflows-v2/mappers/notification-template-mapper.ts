import {
  DEFAULT_WORKFLOW_PREFERENCES,
  PreferencesResponseDto,
  PreferencesTypeEnum,
  RuntimeIssue,
  ShortIsPrefixEnum,
  StepResponseDto,
  StepTypeEnum,
  WorkflowCreateAndUpdateKeys,
  WorkflowListResponseDto,
  WorkflowOriginEnum,
  WorkflowResponseDto,
  WorkflowStatusEnum,
  WorkflowTypeEnum,
} from '@novu/shared';
import { NotificationStepEntity, NotificationTemplateEntity } from '@novu/dal';
import { GetPreferencesResponseDto } from '@novu/application-generic';
import { buildSlug } from '../../shared/helpers/build-slug';

export function toResponseWorkflowDto(
  persistedWorkflow: NotificationTemplateEntity,
  preferences: GetPreferencesResponseDto | undefined
): WorkflowResponseDto {
  const preferencesDto: PreferencesResponseDto = {
    user: preferences?.source[PreferencesTypeEnum.USER_WORKFLOW] || null,
    default: preferences?.source[PreferencesTypeEnum.WORKFLOW_RESOURCE] || DEFAULT_WORKFLOW_PREFERENCES,
  };
  const workflowName = persistedWorkflow.name || 'Missing Name';

  return {
    _id: persistedWorkflow._id,
    slug: buildSlug(workflowName, ShortIsPrefixEnum.WORKFLOW, persistedWorkflow._id),
    workflowId: persistedWorkflow.triggers[0].identifier,
    name: workflowName,
    tags: persistedWorkflow.tags,
    active: persistedWorkflow.active,
    preferences: preferencesDto,
    steps: getSteps(persistedWorkflow),
    description: persistedWorkflow.description,
    origin: computeOrigin(persistedWorkflow),
    updatedAt: persistedWorkflow.updatedAt || 'Missing Updated At',
    createdAt: persistedWorkflow.createdAt || 'Missing Create At',
    status: WorkflowStatusEnum.ACTIVE,
    issues: persistedWorkflow.issues as unknown as Record<WorkflowCreateAndUpdateKeys, RuntimeIssue>,
  };
}

function getSteps(template: NotificationTemplateEntity) {
  const steps: StepResponseDto[] = [];
  for (const step of template.steps) {
    const stepResponseDto = toStepResponseDto(step);
    steps.push(stepResponseDto);
  }

  return steps;
}

function toMinifiedWorkflowDto(template: NotificationTemplateEntity): WorkflowListResponseDto {
  const workflowName = template.name || 'Missing Name';

  return {
    _id: template._id,
    workflowId: template.triggers[0].identifier,
    slug: buildSlug(workflowName, ShortIsPrefixEnum.WORKFLOW, template._id),
    name: workflowName,
    origin: computeOrigin(template),
    tags: template.tags,
    updatedAt: template.updatedAt || 'Missing Updated At',
    stepTypeOverviews: template.steps.map(buildStepTypeOverview).filter((stepTypeEnum) => !!stepTypeEnum),
    createdAt: template.createdAt || 'Missing Create At',
    status: WorkflowStatusEnum.ACTIVE,
  };
}

export function toWorkflowsMinifiedDtos(templates: NotificationTemplateEntity[]): WorkflowListResponseDto[] {
  return templates.map(toMinifiedWorkflowDto);
}

function toStepResponseDto(persistedStep: NotificationStepEntity): StepResponseDto {
  const stepName = persistedStep.name || 'Missing Name';

  return {
    _id: persistedStep._templateId,
    slug: buildSlug(stepName, ShortIsPrefixEnum.STEP, persistedStep._templateId),
    name: stepName,
    stepId: persistedStep.stepId || 'Missing Step Id',
    type: persistedStep.template?.type || StepTypeEnum.EMAIL,
    issues: persistedStep.issues,
  } satisfies StepResponseDto;
}

function buildStepTypeOverview(step: NotificationStepEntity): StepTypeEnum | undefined {
  return step.template?.type;
}

function computeOrigin(template: NotificationTemplateEntity): WorkflowOriginEnum {
  // Required to differentiate between old V1 and new workflows in an attempt to eliminate the need for type field
  return template?.type === WorkflowTypeEnum.REGULAR
    ? WorkflowOriginEnum.NOVU_CLOUD_V1
    : template.origin || WorkflowOriginEnum.EXTERNAL;
}
