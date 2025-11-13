import { describe, it, expect } from 'vitest';
import {
  PLUGIN_NAME,
  CODEX_BASE_URL,
  DUMMY_API_KEY,
  PROVIDER_ID,
  LOG_STAGES,
  ERROR_MESSAGES,
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
});
