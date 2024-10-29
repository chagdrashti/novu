import { Injectable } from '@nestjs/common';
import { ControlPreviewIssue, JSONSchemaDto, StepContentIssueEnum } from '@novu/shared';
import _ = require('lodash');
import { ExtractDefaultsUsecase } from '../get-default-values-from-schema/extract-defaults.usecase';
import { ValidateControlValuesCommand } from './validate-control-values.command';
import { ValidateControlValuesResponse } from './validate-control-values.response';
import { findMissingKeys } from '../../util/usecaseutils';

@Injectable()
export class ValidateControlValuesAndAddDefaultsUseCase {
  constructor(private extractDefaultsUseCase: ExtractDefaultsUsecase) {}

  execute(command: ValidateControlValuesCommand): ValidateControlValuesResponse {
    const defaultValues = this.extractDefaultsUseCase.execute({
      jsonSchemaDto: command.controlSchema.schema as JSONSchemaDto,
    });

    return {
      augmentedControlValues: _.merge(defaultValues, command.controlValues),
      issuesMissingValues: this.buildMissingControlValuesIssuesList(defaultValues, command.controlValues),
    };
  }

  private buildMissingControlValuesIssuesList(defaultValues: Record<string, any>, controlValues: Record<string, any>) {
    const missingRequiredControlValues = findMissingKeys(defaultValues, controlValues);

    return this.buildControlPreviewIssues(missingRequiredControlValues);
  }

  private buildControlPreviewIssues(keys: string[]): Record<string, ControlPreviewIssue[]> {
    const record: Record<string, ControlPreviewIssue[]> = {};

    keys.forEach((key) => {
      record[key] = [
        {
          issueType: StepContentIssueEnum.MISSING_VALUE,
          message: `Value is missing on a required control`, // Custom message for the issue
        },
      ];
    });

    return record;
  }
}
