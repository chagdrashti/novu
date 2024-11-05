import { Injectable } from '@nestjs/common';
import {
  ChannelTypeEnum,
  ControlPreviewIssue,
  GeneratePreviewRequestDto,
  GeneratePreviewResponseDto,
  StepContentIssueEnum,
  StepTypeEnum,
  WorkflowOriginEnum,
} from '@novu/shared';
import { merge } from 'lodash/fp';
import { GeneratePreviewCommand } from './generate-preview-command';
import { PreviewStep, PreviewStepCommand } from '../../../bridge/usecases/preview-step';
import { CreateMockPayloadUseCase } from '../placeholder-enrichment/payload-preview-value-generator.usecase';
import {
  StepMissingControlsException,
  StepMissingStepIdException,
  StepNotFoundException,
} from '../../exceptions/step-not-found-exception';
import { GetWorkflowByIdsUseCase } from '../get-workflow-by-ids/get-workflow-by-ids.usecase';
import { findMissingKeys } from '../../util/usecaseutils';
import { ValidateControlValuesAndAddDefaultsUseCase } from '../validate-control-values/validate-control-values-and-add-defaults.usecase';

@Injectable()
export class GeneratePreviewUsecase {
  constructor(
    private legacyPreviewStepUseCase: PreviewStep,
    private getWorkflowByIdsUseCase: GetWorkflowByIdsUseCase,
    private createMockPayloadUseCase: CreateMockPayloadUseCase,
    private validateControlValuesAndAddDefaultsUseCase: ValidateControlValuesAndAddDefaultsUseCase // Inject the new use case
  ) {}

  async execute(command: GeneratePreviewCommand): Promise<GeneratePreviewResponseDto> {
    const payloadHydrationInfo = this.payloadHydrationLogic(command);
    const workflowInfo = await this.getWorkflowUserIdentifierFromWorkflowObject(command);

    // Use the new use case to validate control values and add defaults
    const controlValuesResult = this.validateControlValuesAndAddDefaultsUseCase.execute({
      controlSchema: workflowInfo.stepControlSchema,
      controlValues: command.generatePreviewRequestDto.controlValues || {},
    });

    const executeOutput = await this.executePreviewUsecase(
      workflowInfo.workflowId,
      workflowInfo.stepId,
      workflowInfo.origin || WorkflowOriginEnum.EXTERNAL,
      payloadHydrationInfo.augmentedPayload,
      controlValuesResult.augmentedControlValues,
      command
    );

    return buildResponse(
      controlValuesResult.issuesMissingValues,
      payloadHydrationInfo.issues,
      executeOutput,
      workflowInfo.stepType
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
    if (!step.stepId) {
      throw new StepMissingStepIdException(command.stepDatabaseId, step);
    }

    return {
      workflowId: persistedWorkflow.triggers[0].identifier,
      stepId: step.stepId,
      stepType: step.template.type,
      stepControlSchema: step.template.controls,
      origin: persistedWorkflow.origin,
    };
  }

  private payloadHydrationLogic(command: GeneratePreviewCommand) {
    const dto = command.generatePreviewRequestDto;

    let aggregatedDefaultValues = {};
    const aggregatedDefaultValuesForControl: Record<string, Record<string, unknown>> = {};
    const flattenedValues = flattenJson(dto.controlValues);
    for (const controlValueKey in flattenedValues) {
      if (flattenedValues.hasOwnProperty(controlValueKey)) {
        const defaultValuesForSingleControlValue = this.createMockPayloadUseCase.execute({
          controlValues: flattenedValues,
          controlValueKey,
        });

        if (defaultValuesForSingleControlValue) {
          aggregatedDefaultValuesForControl[controlValueKey] = defaultValuesForSingleControlValue;
        }
        aggregatedDefaultValues = merge(defaultValuesForSingleControlValue, aggregatedDefaultValues);
      }
    }

    return {
      augmentedPayload: merge(aggregatedDefaultValues, dto.payloadValues),
      issues: this.buildVariableMissingIssueRecord(aggregatedDefaultValuesForControl, aggregatedDefaultValues, dto),
    };
  }

  private buildVariableMissingIssueRecord(
    valueKeyToDefaultsMap: Record<string, Record<string, unknown>>,
    aggregatedDefaultValues: Record<string, unknown>,
    dto: GeneratePreviewRequestDto
  ) {
    const defaultVariableToValueKeyMap = flattenJsonWithArrayValues(valueKeyToDefaultsMap);
    const missingRequiredPayloadIssues = findMissingKeys(aggregatedDefaultValues, dto.payloadValues || {});

    return this.buildPayloadIssues(missingRequiredPayloadIssues, defaultVariableToValueKeyMap);
  }

  private buildPayloadIssues(
    missingVariables: string[],
    variableToControlValueKeys: Record<string, string[]>
  ): Record<string, ControlPreviewIssue[]> {
    const record: Record<string, ControlPreviewIssue[]> = {};

    missingVariables.forEach((missingVariable) => {
      variableToControlValueKeys[missingVariable].forEach((controlValueKey) => {
        record[controlValueKey] = [
          {
            issueType: StepContentIssueEnum.MISSING_VARIABLE_IN_PAYLOAD, // Set issueType to MISSING_VALUE
            message: `Variable payload.${missingVariable} is missing in payload`, // Custom message for the issue
            variableName: `payload.${missingVariable}`,
          },
        ];
      });
    });

    return record;
  }

  private async executePreviewUsecase(
    workflowId: string,
    stepId: string,
    origin: WorkflowOriginEnum,
    hydratedPayload: Record<string, unknown>,
    updatedControlValues: Record<string, unknown>,
    command: GeneratePreviewCommand
  ) {
    return await this.legacyPreviewStepUseCase.execute(
      PreviewStepCommand.create({
        payload: hydratedPayload,
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
}

function buildResponse(
  missingValuesIssue: Record<string, ControlPreviewIssue[]>,
  missingPayloadVariablesIssue: Record<string, ControlPreviewIssue[]>,
  executionOutput,
  stepType: StepTypeEnum
): GeneratePreviewResponseDto {
  return {
    issues: merge(missingValuesIssue, missingPayloadVariablesIssue),
    result: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      preview: executionOutput.outputs as any,
      type: stepType as unknown as ChannelTypeEnum,
    },
  };
}

function flattenJsonWithArrayValues(valueKeyToDefaultsMap: Record<string, Record<string, unknown>>) {
  const flattened = {};
  Object.keys(valueKeyToDefaultsMap).forEach((controlValue) => {
    const defaultPayloads = valueKeyToDefaultsMap[controlValue];
    const defaultPlaceholders = getDotNotationKeys(defaultPayloads);
    defaultPlaceholders.forEach((defaultPlaceholder) => {
      if (!flattened[defaultPlaceholder]) {
        flattened[defaultPlaceholder] = [];
      }
      flattened[defaultPlaceholder].push(controlValue);
    });
  });

  return flattened;
}

type NestedRecord = Record<string, unknown>;

function getDotNotationKeys(input: NestedRecord, parentKey: string = '', keys: string[] = []): string[] {
  for (const key in input) {
    if (input.hasOwnProperty(key)) {
      const newKey = parentKey ? `${parentKey}.${key}` : key; // Construct dot notation key

      if (typeof input[key] === 'object' && input[key] !== null && !Array.isArray(input[key])) {
        // Recursively flatten the object and collect keys
        getDotNotationKeys(input[key] as NestedRecord, newKey, keys);
      } else {
        // Push the dot notation key to the keys array
        keys.push(newKey);
      }
    }
  }

  return keys;
}

function flattenJson(obj, parentKey = '', result = {}) {
  // eslint-disable-next-line guard-for-in
  for (const key in obj) {
    // Construct the new key using dot notation
    const newKey = parentKey ? `${parentKey}.${key}` : key;

    // Check if the value is an object (and not null or an array)
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      // Recursively flatten the object
      flattenJson(obj[key], newKey, result);
    } else if (Array.isArray(obj[key])) {
      // Handle arrays by flattening each item
      obj[key].forEach((item, index) => {
        const arrayKey = `${newKey}[${index}]`;
        if (typeof item === 'object' && item !== null) {
          flattenJson(item, arrayKey, result);
        } else {
          // eslint-disable-next-line no-param-reassign
          result[arrayKey] = item;
        }
      });
    } else {
      // Assign the value to the result with the new key
      // eslint-disable-next-line no-param-reassign
      result[newKey] = obj[key];
    }
  }

  return result;
}
