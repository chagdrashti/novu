/* eslint-disable no-param-reassign */
import { Injectable } from '@nestjs/common';
import { ControlPreviewIssue, ControlPreviewIssueTypeEnum, MasterPayload } from '@novu/shared';
import _ = require('lodash');
import { CreateMockPayloadForSingleControlValueUseCase } from '../placeholder-enrichment/payload-preview-value-generator.usecase';

@Injectable()
export class ConstructPayloadFromPlaceholdersWithDefaultsUseCase {
  constructor(private payloadForSingleControlValueUseCase: CreateMockPayloadForSingleControlValueUseCase) {}

  execute(
    controlValues?: Record<string, unknown>,
    payloadValues?: Record<string, unknown>
  ): {
    augmentedPayload: MasterPayload;
    issues: Record<string, ControlPreviewIssue[]>;
  } {
    let aggregatedDefaultValues = {};
    const aggregatedDefaultValuesForControl: Record<string, Record<string, unknown>> = {};
    const flattenedValues = flattenJson(controlValues);

    for (const controlValueKey in flattenedValues) {
      if (flattenedValues.hasOwnProperty(controlValueKey)) {
        const defaultPayloadForASingleControlValue = this.payloadForSingleControlValueUseCase.execute({
          controlValues: flattenedValues,
          controlValueKey,
        });

        if (defaultPayloadForASingleControlValue) {
          aggregatedDefaultValuesForControl[controlValueKey] = defaultPayloadForASingleControlValue;
        }
        aggregatedDefaultValues = _.merge(defaultPayloadForASingleControlValue, aggregatedDefaultValues);
      }
    }

    return {
      augmentedPayload: _.merge(aggregatedDefaultValues, payloadValues),
      issues: this.buildVariableMissingIssueRecord(
        aggregatedDefaultValuesForControl,
        aggregatedDefaultValues,
        payloadValues
      ),
    };
  }

  private buildVariableMissingIssueRecord(
    valueKeyToDefaultsMap: Record<string, Record<string, unknown>>,
    aggregatedDefaultValues: Record<string, unknown>,
    payloadValues: Record<string, unknown> | undefined
  ) {
    const defaultVariableToValueKeyMap = flattenJsonWithArrayValues(valueKeyToDefaultsMap);
    const missingRequiredPayloadIssues = this.findMissingKeys(aggregatedDefaultValues, payloadValues || {});

    return this.buildPayloadIssues(missingRequiredPayloadIssues, defaultVariableToValueKeyMap);
  }

  private findMissingKeys(requiredRecord: Record<string, unknown>, actualRecord: Record<string, unknown>) {
    const requiredKeys = this.collectKeys(requiredRecord);
    const actualKeys = this.collectKeys(actualRecord);

    return _.difference(requiredKeys, actualKeys);
  }

  private collectKeys(obj, prefix = '') {
    return _.reduce(
      obj,
      (result, value, key) => {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (_.isObject(value) && !_.isArray(value)) {
          result.push(...this.collectKeys(value, newKey));
        } else {
          result.push(newKey);
        }

        return result;
      },
      []
    );
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
            issueType: ControlPreviewIssueTypeEnum.MISSING_VARIABLE_IN_PAYLOAD,
            message: `Variable payload.${missingVariable} is missing in payload`,
            variableName: `payload.${missingVariable}`,
          },
        ];
      });
    });

    return record;
  }
}
function flattenJson(obj, parentKey = '', result = {}) {
  // eslint-disable-next-line guard-for-in
  for (const key in obj) {
    const newKey = parentKey ? `${parentKey}.${key}` : key;

    if (typeof obj[key] === 'object' && obj[key] !== null && !_.isArray(obj[key])) {
      flattenJson(obj[key], newKey, result);
    } else if (_.isArray(obj[key])) {
      obj[key].forEach((item, index) => {
        const arrayKey = `${newKey}[${index}]`;
        if (typeof item === 'object' && item !== null) {
          flattenJson(item, arrayKey, result);
        } else {
          result[arrayKey] = item;
        }
      });
    } else {
      result[newKey] = obj[key];
    }
  }

  return result;
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
      const newKey = parentKey ? `${parentKey}.${key}` : key;

      if (typeof input[key] === 'object' && input[key] !== null && !_.isArray(input[key])) {
        getDotNotationKeys(input[key] as NestedRecord, newKey, keys);
      } else {
        keys.push(newKey);
      }
    }
  }

  return keys;
}
