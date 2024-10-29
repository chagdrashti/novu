import {
  ControlPreviewIssue,
  RuntimeIssue,
  StepIssueEnum,
  StepIssuesDto,
  WorkflowIssueTypeEnum,
  WorkflowResponseDto,
} from '@novu/shared';
import { ControlValuesEntity, NotificationStepEntity, NotificationTemplateRepository } from '@novu/dal';
import { NotificationTemplateEntity } from '@novu/dal/src';
import { ValidateWorkflowCommand } from './validate-workflow.command';
import { ValidateControlValuesAndAddDefaultsUseCase } from '../validate-control-values/validate-control-values-and-add-defaults.usecase';

export class ValidateAndPersistWorkflowIssuesUsecase {
  constructor(
    private notificationTemplateRepository: NotificationTemplateRepository,
    private validateControlValuesAndAddDefaultsUseCase: ValidateControlValuesAndAddDefaultsUseCase
  ) {}

  async execute(command: ValidateWorkflowCommand) {
    const workflowIssues: Record<keyof WorkflowResponseDto, RuntimeIssue[]> = await this.validateWorkflowBody(command);
    const stepIssues: StepIssuesDto = this.validateSteps(command.workflow.steps, command.stepIdToControlValuesMap);
    const workflowWithIssues = this.updateIssuesOnWorkflow(command.workflow, workflowIssues, stepIssues);
    await this.notificationTemplateRepository.update(
      {
        _id: command.workflow._id,
        _environmentId: command.user.environmentId,
      },
      command.workflow
    );

    return workflowWithIssues;
  }

  private validateSteps(
    steps: NotificationStepEntity[],
    stepIdToControlValuesMap: { [p: string]: ControlValuesEntity }
  ): Record<string, StepIssuesDto> {
    const stepIdToIssues: Record<string, StepIssuesDto> = {};
    for (const step of steps) {
      // @ts-ignore
      const stepIssues: Required<StepIssuesDto> = { body: {}, controls: {} };
      this.addControlIssues(step, stepIdToControlValuesMap, stepIssues);
      this.addStepBodyIssues(step, stepIssues);
      stepIdToIssues[step._templateId] = stepIssues;
    }

    return stepIdToIssues;
  }

  private addControlIssues(
    step: NotificationStepEntity,
    stepIdToControlValuesMap: {
      [p: string]: ControlValuesEntity;
    },
    stepIssues: StepIssuesDto
  ) {
    if (step.controls) {
      const { issuesMissingValues } = this.validateControlValuesAndAddDefaultsUseCase.execute({
        controlSchema: step.controls,
        controlValues: stepIdToControlValuesMap,
      });
      // eslint-disable-next-line no-param-reassign
      stepIssues.controls = issuesMissingValues;
    }
  }
  private async validateWorkflowBody(
    command: ValidateWorkflowCommand
  ): Promise<Record<keyof WorkflowResponseDto, RuntimeIssue[]>> {
    // @ts-ignore
    const issues: Record<keyof WorkflowResponseDto, RuntimeIssue[]> = {};
    const findAllByTriggerIdentifier = await this.notificationTemplateRepository.findAllByTriggerIdentifier(
      command.user.environmentId,
      command.workflow.triggers[0].identifier
    );
    if (findAllByTriggerIdentifier && findAllByTriggerIdentifier.length > 1) {
      // eslint-disable-next-line no-param-reassign
      command.workflow.triggers[0].identifier = `${command.workflow.triggers[0].identifier}-${command.workflow._id}`;
      issues.workflowId = [
        {
          issueType: WorkflowIssueTypeEnum.WORKFLOW_ID_ALREADY_EXIST,
          message: 'Trigger identifier is not unique',
        },
      ];
    }

    return issues;
  }

  private addStepBodyIssues(step: NotificationStepEntity, stepIssues: Required<StepIssuesDto>) {
    if (!step.name || step.name.trim() === '') {
      // eslint-disable-next-line no-param-reassign
      stepIssues.body.name = {
        issueType: StepIssueEnum.MISSING_REQUIRED_VALUE,
        message: 'Step name is missing',
      };
    }
  }

  private updateIssuesOnWorkflow(
    workflow: NotificationTemplateEntity,
    workflowIssues: Record<keyof WorkflowResponseDto, RuntimeIssue[]>,
    stepIssues: StepIssuesDto
  ): NotificationTemplateEntity {
    // eslint-disable-next-line no-param-reassign
    workflow.issues = workflowIssues as unknown as Record<string, ControlPreviewIssue[]>;
    workflow.steps = workflow.steps.map((step) => ({ ...step, issues: stepIssues[step._templateId] }));
    return {
      ...workflow,
      steps: ,
      issues: {
        ...workflow.issues,
        ...workflowIssues,
      },
    };
  }
}
