import { UserSession } from '@novu/testing';
import { expect } from 'chai';
import { randomUUID } from 'node:crypto';
import { after, beforeEach } from 'mocha';
import { sleep } from '@nestjs/terminus/dist/utils';
import {
  ChannelTypeEnum,
  createWorkflowClient,
  EmailStepControlSchemaDto,
  GeneratePreviewRequestDto,
  GeneratePreviewResponseDto,
  HttpError,
  NovuRestResult,
  RedirectTargetEnum,
  StepTypeEnum,
} from '@novu/shared';
import { InAppOutput } from '@novu/framework/internal';
import { buildCreateWorkflowDto } from './workflow.controller.e2e';
import { forSnippet, fullCodeSnippet } from './maily-test-data';

const SUBJECT_TEST_PAYLOAD = '{{payload.subject.test.payload}}';
const PLACEHOLDER_SUBJECT_INAPP = '{{payload.subject}}';
const PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE = 'this is the replacement text for the placeholder';
describe('Generate Preview', () => {
  let session: UserSession;
  let workflowsClient: ReturnType<typeof createWorkflowClient>;

  beforeEach(async () => {
    session = new UserSession();
    await session.initialize();
    workflowsClient = createWorkflowClient(session.serverUrl, getHeaders());
  });
  after(async () => {
    await sleep(1000);
  });
  describe('Generate Preview', () => {
    describe('Hydration testing', () => {
      const channelTypes = [{ type: StepTypeEnum.IN_APP, description: 'InApp' }];

      channelTypes.forEach(({ type, description }) => {
        it(`${type}:should match the body in the preview response`, async () => {
          const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(type);
          const requestDto = buildDtoWithPayload(type);
          const previewResponseDto = await generatePreview(workflowId, stepDatabaseId, requestDto, description);
          expect(previewResponseDto.result!.preview).to.exist;
          const expectedRenderedResult = buildInAppControlValues();
          expectedRenderedResult.subject = buildInAppControlValues().subject!.replace(
            PLACEHOLDER_SUBJECT_INAPP,
            PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE
          );
          expect(previewResponseDto.result!.preview).to.deep.equal(expectedRenderedResult);
        });
      });
    });
    describe('Happy Path, no payload, expected same response as requested', () => {
      const channelTypes = [
        { type: StepTypeEnum.IN_APP, description: 'InApp' },
        { type: StepTypeEnum.SMS, description: 'SMS' },
        { type: StepTypeEnum.PUSH, description: 'Push' },
        { type: StepTypeEnum.CHAT, description: 'Chat' },
        { type: StepTypeEnum.EMAIL, description: 'Email' },
      ];

      channelTypes.forEach(({ type, description }) => {
        it(`${type}:should match the body in the preview response`, async () => {
          const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(type);
          const requestDto = buildDtoNoPayload(type);
          const previewResponseDto = await generatePreview(workflowId, stepDatabaseId, requestDto, description);
          expect(previewResponseDto.result!.preview).to.exist;
          expect(previewResponseDto.issues).to.exist;

          if (type !== StepTypeEnum.EMAIL) {
            expect(previewResponseDto.result!.preview).to.deep.equal(stepTypeTo[type]);
          } else {
            assertEmail(previewResponseDto);
          }
        });
      });
    });
    describe('email specific features', () => {
      describe('show', () => {
        it('show -> should hide element based on payload', async () => {
          const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(StepTypeEnum.EMAIL);
          const previewResponseDto = await generatePreview(
            workflowId,
            stepDatabaseId,
            {
              validationStrategies: [],
              controlValues: stepTypeTo[StepTypeEnum.EMAIL],
              payloadValues: { params: { isPayedUser: 'false' } },
            },
            'email'
          );
          expect(previewResponseDto.result!.preview).to.exist;

          const preview = previewResponseDto.result!.preview.body;
          expect(preview).to.not.contain('should be the fallback value');
        });
        it('show -> should show element based on payload - string', async () => {
          const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(StepTypeEnum.EMAIL);
          const previewResponseDto = await generatePreview(
            workflowId,
            stepDatabaseId,
            {
              validationStrategies: [],
              controlValues: stepTypeTo[StepTypeEnum.EMAIL],
              payloadValues: { params: { isPayedUser: 'true' } },
            },
            'email'
          );
          expect(previewResponseDto.result!.preview).to.exist;

          const preview = previewResponseDto.result!.preview.body;
          expect(preview).to.contain('should be the fallback value');
        });
        it('show -> should show element based on payload - boolean', async () => {
          const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(StepTypeEnum.EMAIL);
          const previewResponseDto = await generatePreview(
            workflowId,
            stepDatabaseId,
            {
              validationStrategies: [],
              controlValues: stepTypeTo[StepTypeEnum.EMAIL],
              payloadValues: { params: { isPayedUser: true } },
            },
            'email'
          );
          expect(previewResponseDto.result!.preview).to.exist;

          const preview = previewResponseDto.result!.preview.body;
          expect(preview).to.contain('should be the fallback value');
        });
        it('show -> should show element if payload is missing', async () => {
          const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(StepTypeEnum.EMAIL);
          const previewResponseDto = await generatePreview(
            workflowId,
            stepDatabaseId,
            {
              validationStrategies: [],
              controlValues: stepTypeTo[StepTypeEnum.EMAIL],
              payloadValues: { params: { isPayedUser: 'true' } },
            },
            'email'
          );
          expect(previewResponseDto.result!.preview).to.exist;

          const preview = previewResponseDto.result!.preview.body;
          expect(preview).to.contain('should be the fallback value');
        });
      });
      describe('for', () => {
        it('should populate for if payload exist with actual values', async () => {
          const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(StepTypeEnum.EMAIL);
          const name1 = 'ball is round';
          const name2 = 'square is square';
          const previewResponseDto = await generatePreview(
            workflowId,
            stepDatabaseId,
            {
              validationStrategies: [],
              controlValues: buildSimpleForEmail() as unknown as Record<string, unknown>,
              payloadValues: { food: { items: [{ name: name1 }, { name: name2 }] } },
            },
            'email'
          );
          expect(previewResponseDto.result!.preview).to.exist;
          const preview = previewResponseDto.result!.preview.body;
          expect(preview).not.to.contain('{{item.name}}1');
          expect(preview).not.to.contain('{{item.name}}2');
          expect(preview).to.contain(name1);
          expect(preview).to.contain(name2);
        });
      });
    });

    describe('Missing Required ControlValues', () => {
      const channelTypes = [{ type: StepTypeEnum.IN_APP, description: 'InApp' }];

      channelTypes.forEach(({ type, description }) => {
        it(`${type}: should assign default values to missing elements`, async () => {
          const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(type);
          const requestDto = buildDtoWithMissingControlValues(type);
          const previewResponseDto = await generatePreview(workflowId, stepDatabaseId, requestDto, description);
          expect(previewResponseDto.result!.preview.body).to.exist;
          expect(previewResponseDto.result!.preview.body).to.equal('PREVIEW_ISSUE:REQUIRED_CONTROL_VALUE_IS_MISSING');
          const { issues } = previewResponseDto;
          expect(issues).to.exist;
          expect(issues.body).to.exist;
        });
      });
    });
  });

  function getHeaders(): HeadersInit {
    return {
      Authorization: session.token, // Fixed space
      'Novu-Environment-Id': session.environment._id,
    };
  }

  async function generatePreview(
    workflowId: string,
    stepDatabaseId: string,
    dto: GeneratePreviewRequestDto,
    description: string
  ): Promise<GeneratePreviewResponseDto> {
    const novuRestResult = await workflowsClient.generatePreview(workflowId, stepDatabaseId, dto);
    if (novuRestResult.isSuccessResult()) {
      return novuRestResult.value;
    }
    throw await assertHttpError(description, novuRestResult);
  }

  async function createWorkflowAndReturnId(type: StepTypeEnum) {
    const createWorkflowDto = buildCreateWorkflowDto(`${type}:${randomUUID()}`);
    createWorkflowDto.steps[0].type = type;
    const workflowResult = await workflowsClient.createWorkflow(createWorkflowDto);
    if (!workflowResult.isSuccessResult()) {
      throw new Error(`Failed to create workflow ${JSON.stringify(workflowResult.error)}`);
    }

    return { workflowId: workflowResult.value._id, stepDatabaseId: workflowResult.value.steps[0]._id };
  }
});

function buildDtoNoPayload(stepTypeEnum: StepTypeEnum): GeneratePreviewRequestDto {
  return {
    validationStrategies: [],
    controlValues: stepTypeTo[stepTypeEnum],
  };
}

function buildDtoWithPayload(stepTypeEnum: StepTypeEnum): GeneratePreviewRequestDto {
  return {
    validationStrategies: [],
    controlValues: stepTypeTo[stepTypeEnum],
    payloadValues: { subject: PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE },
  };
}

function buildDtoWithMissingControlValues(stepTypeEnum: StepTypeEnum): GeneratePreviewRequestDto {
  const stepTypeToElement = stepTypeTo[stepTypeEnum];
  if (stepTypeEnum === StepTypeEnum.EMAIL) {
    delete stepTypeToElement.subject;
  } else {
    delete stepTypeToElement.body;
  }

  return {
    validationStrategies: [],
    controlValues: stepTypeToElement,
    payloadValues: { subject: PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE },
  };
}

function buildEmailControlValuesPayload(): EmailStepControlSchemaDto {
  return {
    subject: `Hello, World! ${SUBJECT_TEST_PAYLOAD}`,
    emailEditor: JSON.stringify(fullCodeSnippet),
  };
}
function buildSimpleForEmail(): EmailStepControlSchemaDto {
  return {
    subject: `Hello, World! ${SUBJECT_TEST_PAYLOAD}`,
    emailEditor: JSON.stringify(forSnippet),
  };
}
function buildInAppControlValues(): InAppOutput {
  return {
    subject: `Hello, World! ${PLACEHOLDER_SUBJECT_INAPP}`,
    body: 'Hello, World! {{payload.placeholder.body}}',
    avatar: 'https://www.example.com/avatar.png',
    primaryAction: {
      label: '{{payload.secondaryUrl}}',
      redirect: {
        target: RedirectTargetEnum.BLANK,
        url: 'https://www.example.com/primary-action',
      },
    },
    secondaryAction: {
      label: 'Secondary Action',
      redirect: {
        target: RedirectTargetEnum.BLANK,
        url: 'https://www.example.com/secondary-action',
      },
    },
    data: {
      key: 'value',
    },
    redirect: {
      target: RedirectTargetEnum.BLANK,
      url: 'https://www.example.com/redirect',
    },
  };
}

function buildSmsControlValuesPayload() {
  return {
    body: 'Hello, World!',
  };
}

function buildPushControlValuesPayload() {
  return {
    subject: 'Hello, World!',
    body: 'Hello, World!',
  };
}

function buildChatControlValuesPayload() {
  return {
    body: 'Hello, World!',
  };
}

const stepTypeTo = {
  [StepTypeEnum.SMS]: buildSmsControlValuesPayload(),
  [StepTypeEnum.EMAIL]: buildEmailControlValuesPayload() as unknown as Record<string, unknown>,
  [StepTypeEnum.PUSH]: buildPushControlValuesPayload(),
  [StepTypeEnum.CHAT]: buildChatControlValuesPayload(),
  [StepTypeEnum.IN_APP]: buildInAppControlValues(),
};

async function assertHttpError(
  description: string,
  novuRestResult: NovuRestResult<GeneratePreviewResponseDto, HttpError>
) {
  if (novuRestResult.error) {
    return new Error(`${description}: Failed to generate preview: ${novuRestResult.error.message}`);
  }

  return new Error(`${description}: Failed to generate preview, bug in response error mapping `);
}

function assertEmail(dto: GeneratePreviewResponseDto) {
  if (dto.result!.type === ChannelTypeEnum.EMAIL) {
    const preview = dto.result!.preview.body;
    expect(preview).to.exist;
    expect(preview).to.contain('{{item.header}}1');
    expect(preview).to.contain('{{item.header}}2');
    expect(preview).to.contain('{{item.name}}1');
    expect(preview).to.contain('{{item.name}}2');
    expect(preview).to.contain('{{item.id}}1');
    expect(preview).to.contain('{{item.id}}2');
    expect(preview).to.contain('{{item.origin.country}}1');
    expect(preview).to.contain('{{item.origin.country}}2');
    expect(preview).to.contain('{{payload.body}}');
    expect(preview).to.contain('should be the fallback value');
  }
}
