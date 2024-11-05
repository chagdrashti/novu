import { EmailRenderOutput, PreviewPayloadExample, TipTapNode } from '@novu/shared';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { render } from '@maily-to/render';
import { RenderCommand } from './render-command';
import { ExpandEmailEditorSchemaUsecase } from './email-schema-expander.usecase';
import { HydrateEmailSchemaUseCase } from './hydrate-email-schema.usecase';

export class RenderEmailOutputCommand extends RenderCommand {
  mainPayload: PreviewPayloadExample;
}

@Injectable()
export class RenderEmailOutputUsecase {
  constructor(
    private expendEmailEditorSchemaUseCase: ExpandEmailEditorSchemaUsecase,
    private hydrateEmailSchemaUseCase: HydrateEmailSchemaUseCase // Inject the new use case
  ) {}

  async execute(renderCommand: RenderEmailOutputCommand): Promise<EmailRenderOutput> {
    const { emailEditor, subject } = EmailStepControlSchema.parse(renderCommand.controlValues);
    const emailSchemaHydrated = this.hydrate(emailEditor, renderCommand);
    const expandedSchema = this.transformForAndShowLogic(emailSchemaHydrated);
    const htmlRendered = await render(expandedSchema);

    return { subject, body: htmlRendered };
  }

  private transformForAndShowLogic(body: TipTapNode) {
    return this.expendEmailEditorSchemaUseCase.execute({ schema: body });
  }

  private hydrate(emailEditor: string, renderCommand: RenderEmailOutputCommand) {
    const { hydratedEmailSchema } = this.hydrateEmailSchemaUseCase.execute({
      emailEditor,
      masterPayload: renderCommand.mainPayload,
    });

    return hydratedEmailSchema;
  }
}

export const EmailStepControlSchema = z
  .object({
    emailEditor: z.string(),
    subject: z.string(),
  })
  .strict();
