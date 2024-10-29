import { ControlsSchema } from '@novu/shared';

export class ValidateControlValuesCommand {
  controlSchema: ControlsSchema;
  controlValues: Record<string, unknown>;
}
