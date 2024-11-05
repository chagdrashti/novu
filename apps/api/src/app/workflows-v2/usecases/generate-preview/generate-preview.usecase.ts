import { Injectable } from '@nestjs/common';
import {
  ChannelTypeEnum,
  ControlPreviewIssue,
  ControlPreviewIssueTypeEnum,
  ControlSchemas,
  GeneratePreviewResponseDto,
  JSONSchemaDto,
  PreviewPayloadExample,
  StepTypeEnum,
  WorkflowOriginEnum,
} from '@novu/shared';
import { merge } from 'lodash/fp';
import _ = require('lodash');
import { GeneratePreviewCommand } from './generate-preview-command';
import { PreviewStep, PreviewStepCommand } from '../../../bridge/usecases/preview-step';
import { StepMissingControlsException, StepNotFoundException } from '../../exceptions/step-not-found-exception';
import { ExtractDefaultsUsecase } from '../get-default-values-from-schema/extract-defaults.usecase';
import { ConstructPayloadFromPlaceholdersWithDefaultsUseCase } from './construct-payload-from-placeholders-with-defaults-use-case.service';
import { GetWorkflowByIdsUseCase } from '../get-workflow-by-ids/get-workflow-by-ids.usecase';
import { OriginMissingException, StepIdMissingException } from './step-id-missing.exception';

@Injectable()
export class GeneratePreviewUsecase {
  constructor(
    private legacyPreviewStepUseCase: PreviewStep,
    private getWorkflowByIdsUseCase: GetWorkflowByIdsUseCase,
    private extractDefaultsUseCase: ExtractDefaultsUsecase,
    private constructPayloadUseCase: ConstructPayloadFromPlaceholdersWithDefaultsUseCase
  ) {}

  async execute(command: GeneratePreviewCommand): Promise<GeneratePreviewResponseDto> {
    const payloadHydrationInfo = this.buildPayloadIfMissing(command);
    const workflowInfo = await this.getWorkflowUserIdentifierFromWorkflowObject(command);
    const controlValuesResult = this.addMissingValuesToControlValues(command, workflowInfo.stepControlSchema);
    const executeOutput = await this.executePreviewUsecase(
      workflowInfo.workflowId,
      workflowInfo.stepId,
      workflowInfo.origin,
      payloadHydrationInfo.augmentedPayload,
      controlValuesResult.augmentedControlValues,
      command
    );

    return buildResponse(
      controlValuesResult.issuesMissingValues,
      payloadHydrationInfo.issues,
      executeOutput,
      workflowInfo.stepType,
      payloadHydrationInfo.augmentedPayload
    );
  }

  private buildPayloadIfMissing(command: GeneratePreviewCommand) {
    const { controlValues, payloadValues } = command.generatePreviewRequestDto;

    return this.constructPayloadUseCase.execute(controlValues, payloadValues);
  }

  private addMissingValuesToControlValues(command: GeneratePreviewCommand, stepControlSchema: ControlSchemas) {
    const defaultValues = this.extractDefaultsUseCase.execute({
      jsonSchemaDto: stepControlSchema.schema as JSONSchemaDto,
    });

    return {
      augmentedControlValues: merge(defaultValues, command.generatePreviewRequestDto.controlValues),
      issuesMissingValues: this.buildMissingControlValuesIssuesList(defaultValues, command),
    };
  }

  private buildMissingControlValuesIssuesList(defaultValues: Record<string, any>, command: GeneratePreviewCommand) {
    const missingRequiredControlValues = findMissingKeys(
      defaultValues,
      command.generatePreviewRequestDto.controlValues || {}
    );

    return this.buildControlPreviewIssues(missingRequiredControlValues);
  }

  private buildControlPreviewIssues(keys: string[]): Record<string, ControlPreviewIssue[]> {
    const record: Record<string, ControlPreviewIssue[]> = {};

    keys.forEach((key) => {
      record[key] = [
        {
          issueType: ControlPreviewIssueTypeEnum.MISSING_VALUE,
          message: `Value is missing on a required control`,
        },
      ];
    });

    return record;
  }

  private async executePreviewUsecase(
    workflowId: string,
    stepId: string | undefined,
    origin: WorkflowOriginEnum | undefined,
    hydratedPayload: PreviewPayloadExample,
    updatedControlValues: Record<string, unknown>,
    command: GeneratePreviewCommand
  ) {
    if (!stepId) {
      throw new StepIdMissingException(workflowId);
    }
    if (!origin) {
      throw new OriginMissingException(stepId);
    }

    return await this.legacyPreviewStepUseCase.execute(
      PreviewStepCommand.create({
        payload: hydratedPayload.payload,
        subscriber: hydratedPayload.subscriber,
        controls: updatedControlValues || {},
        environmentId: command.user.environmentId,
        organizationId: command.user.organizationId,
        stepId,
        userId: command.user._id,
        workflowId,
        workflowOrigin: origin,
      })
    );
  }

  private async getWorkflowUserIdentifierFromWorkflowObject(command: GeneratePreviewCommand) {
    const persistedWorkflow = await this.getWorkflowByIdsUseCase.execute({
      identifierOrInternalId: command.workflowId,
      user: command.user,
    });
    const { steps } = persistedWorkflow;
    const step = steps.find((stepDto) => stepDto._id === command.stepDatabaseId);
    if (!step) {
      throw new StepNotFoundException(command.stepDatabaseId);
    }
    if (!step.template || !step.template.controls) {
      throw new StepMissingControlsException(command.stepDatabaseId, step);
    }

    return {
      workflowId: persistedWorkflow.triggers[0].identifier,
      stepId: step.stepId,
      stepType: step.template.type,
      stepControlSchema: step.template.controls,
      origin: persistedWorkflow.origin,
    };
  }
}

function buildResponse(
  missingValuesIssue: Record<string, ControlPreviewIssue[]>,
  missingPayloadVariablesIssue: Record<string, ControlPreviewIssue[]>,
  executionOutput,
  stepType: StepTypeEnum,
  augmentedPayload: PreviewPayloadExample
): GeneratePreviewResponseDto {
  return {
    issues: merge(missingValuesIssue, missingPayloadVariablesIssue),
    result: {
      preview: executionOutput.outputs as any,
      type: stepType as unknown as ChannelTypeEnum,
    },
    previewPayloadExample: augmentedPayload,
  };
}

function findMissingKeys(requiredRecord: Record<string, unknown>, actualRecord: Record<string, unknown>): string[] {
  const requiredKeys = collectKeys(requiredRecord);
  const actualKeys = collectKeys(actualRecord);

  return _.difference(requiredKeys, actualKeys);
}

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  // Initialize result as an empty array of strings
  return _.reduce(
    obj,
    (result: string[], value, key) => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (_.isObject(value) && !_.isArray(value)) {
        // Call collectKeys recursively and concatenate the results
        result.push(...collectKeys(value, newKey));
      } else {
        result.push(newKey);
      }

      return result;
    },
    [] // Pass an empty array as the initial value
  );
}
