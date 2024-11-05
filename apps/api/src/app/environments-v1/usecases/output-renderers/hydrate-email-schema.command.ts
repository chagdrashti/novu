// New HydrateEmailSchemaUseCase class

import { PreviewPayloadExample } from '@novu/shared';

export class HydrateEmailSchemaCommand {
  emailEditor: string;
  masterPayload: PreviewPayloadExample;
}
