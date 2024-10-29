/* eslint-disable @typescript-eslint/naming-convention */
import { JSONSchemaDto } from './json-schema-dto';

export interface TipTapNode {
  type?: string;
  attrs?: Record<string, any>;
  content?: TipTapNode[];
  marks?: {
    type: string;
    attrs?: Record<string, any>;
    [key: string]: any;
  }[];
  text?: string;
  [key: string]: any;
}
export interface EmailStepControlSchemaDto {
  emailEditor: string;
  subject: string;
}

export enum CustomComponentsEnum {
  EMAIL_EDITOR = 'EMAIL_EDITOR',
  TEXT_AREA = 'TEXT_FIELD',
}

export const EmailStepControlSchema: JSONSchemaDto = {
  type: 'object',
  properties: {
    emailEditor: {
      type: 'string',
    },
    subject: {
      type: 'string',
    },
  },
  required: ['emailEditor', 'subject'],
  additionalProperties: false,
};
