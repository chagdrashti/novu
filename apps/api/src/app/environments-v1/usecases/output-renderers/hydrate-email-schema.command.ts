// New HydrateEmailSchemaUseCase class

import { MasterPayload } from '@novu/shared';

export class HydrateEmailSchemaCommand {
  emailEditor: string;
  masterPayload: MasterPayload;
}
