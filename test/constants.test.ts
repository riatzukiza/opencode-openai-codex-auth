import { describe, it, expect } from 'vitest';
import {
  PLUGIN_NAME,
  CODEX_BASE_URL,
  DUMMY_API_KEY,
  PROVIDER_ID,
  LOG_STAGES,
  ERROR_MESSAGES,
  HTTP_STATUS,
  OPENAI_HEADERS,
  OPENAI_HEADER_VALUES,
  URL_PATHS,
  JWT_CLAIM_PATH,
  AUTH_LABELS,
} from '../lib/constants.js';

describe('General constants', () => {
  it('exposes the codex plugin identity', () => {
    expect(PLUGIN_NAME).toBe('openai-codex-plugin');
    expect(PROVIDER_ID).toBe('openai');
  });

  it('documents codex networking defaults', () => {
    expect(CODEX_BASE_URL).toBe('https://chatgpt.com/backend-api');
    expect(DUMMY_API_KEY).toBe('chatgpt-oauth');
  });

  it('includes logging and error helpers', () => {
    expect(LOG_STAGES.RESPONSE).toBe('response');
    expect(LOG_STAGES.ERROR_RESPONSE).toBe('error-response');
    expect(ERROR_MESSAGES.NO_ACCOUNT_ID).toContain('accountId');
  });

  it('exposes HTTP status codes used by the plugin', () => {
    expect(HTTP_STATUS.OK).toBe(200);
    expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
  });

  it('defines OpenAI header names and values', () => {
    expect(OPENAI_HEADERS.ACCOUNT_ID).toBe('chatgpt-account-id');
    expect(OPENAI_HEADER_VALUES.BETA_RESPONSES).toBe('responses=experimental');
    expect(OPENAI_HEADER_VALUES.ORIGINATOR_CODEX).toBe('codex_cli_rs');
  });

  it('documents URL paths and auth claim path', () => {
    expect(URL_PATHS.RESPONSES).toBe('/responses');
    expect(URL_PATHS.CODEX_RESPONSES).toBe('/codex/responses');
    expect(JWT_CLAIM_PATH).toBe('https://api.openai.com/auth');
  });

  it('includes human-readable OAuth labels', () => {
    expect(AUTH_LABELS.OAUTH).toContain('ChatGPT Plus/Pro');
    expect(AUTH_LABELS.API_KEY).toContain('API Key');
  });
});
