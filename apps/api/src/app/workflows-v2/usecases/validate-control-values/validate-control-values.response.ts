// Define the response interface for ValidateControlValuesAndAddDefaultsUseCase
import { ControlPreviewIssue } from '@novu/shared';

export class ValidateControlValuesResponse {
  augmentedControlValues: Record<string, unknown>;
  issuesMissingValues: Record<string, ControlPreviewIssue[]>;
}
