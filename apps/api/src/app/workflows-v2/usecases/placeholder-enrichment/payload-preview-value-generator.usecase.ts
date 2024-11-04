import { Injectable } from '@nestjs/common';
import { TransformPlaceholderMapUseCase } from './transform-placeholder.usecase';
import { AddKeysToPayloadBasedOnHydrationStrategyCommand } from './add-keys-to-payload-based-on-hydration-strategy-command';
import { HydrateEmailSchemaUseCase } from '../../../environments-v1/usecases/output-renderers';

@Injectable()
export class CreateMockPayloadForSingleControlValueUseCase {
  constructor(
    private readonly transformPlaceholderMapUseCase: TransformPlaceholderMapUseCase,
    private hydrateEmailSchemaUseCase: HydrateEmailSchemaUseCase
  ) {}

  public execute(command: AddKeysToPayloadBasedOnHydrationStrategyCommand): Record<string, unknown> {
    const { controlValues, controlValueKey } = command;

    if (!controlValues) {
      return {};
    }

    const controlValue = controlValues[controlValueKey];
    const safeAttemptToParseEmailSchema = this.safeAttemptToParseEmailSchema(controlValue);
    if (safeAttemptToParseEmailSchema) {
      return safeAttemptToParseEmailSchema;
    }

    return this.buildPayloadForRegularText(controlValue);
  }

  private safeAttemptToParseEmailSchema(controlValue: string) {
    try {
      const { nestedPayload } = this.hydrateEmailSchemaUseCase.execute({
        emailEditor: controlValue,
        masterPayload: {
          payload: {},
          subscriber: {},
          steps: {},
        },
      });

      return nestedPayload;
    } catch (e) {
      return undefined;
    }
  }

  private buildPayloadForRegularText(controlValue: unknown) {
    const strings = extractPlaceholders(controlValue as string).filter(
      (placeholder) => !placeholder.startsWith('subscriber') && !placeholder.startsWith('actor')
    );

    return this.transformPlaceholderMapUseCase.execute({
      input: { regular: convertToRecord(strings) },
    }).payload;
  }
}
export function extractPlaceholders(text: string): string[] {
  const regex = /\{\{\{(.*?)\}\}\}|\{\{(.*?)\}\}|\{#(.*?)#\}/g; // todo: add support for nested placeholders
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(text)) !== null) {
    const placeholder = match[1] || match[2] || match[3];
    if (placeholder) {
      matches.push(placeholder.trim());
    }
  }

  return matches;
}
function convertToRecord(keys: string[]): Record<string, any> {
  return keys.reduce(
    (acc, key) => {
      acc[key] = ''; // You can set the value to any default value you want

      return acc;
    },
    {} as Record<string, any>
  );
}
