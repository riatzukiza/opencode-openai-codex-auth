import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateContentHash,
  hasBridgePromptInConversation,
  getCachedBridgeDecision,
  cacheBridgeDecision,
  generateInputHash,
} from '../lib/cache/prompt-fingerprinting';

describe('prompt-fingerprinting', () => {
  describe('generateContentHash', () => {
    it('produces stable hash for same content and different for different content', () => {
      const a1 = generateContentHash('hello');
      const a2 = generateContentHash('hello');
      const b = generateContentHash('world');
      expect(a1).toBe(a2);
      expect(a1).not.toBe(b);
      expect(a1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('hasBridgePromptInConversation', () => {
    it('detects exact bridge content in last 5 developer/system messages', () => {
      const bridge = 'BRIDGE_PROMPT_CONTENT';
      const input = [
        { type: 'message', role: 'user', content: 'hi' },
        { type: 'message', role: 'assistant', content: 'hey' },
        { type: 'message', role: 'user', content: 'again' },
        { type: 'message', role: 'developer', content: 'not it' },
        { type: 'message', role: 'system', content: bridge },
      ];
      expect(hasBridgePromptInConversation(input as any[], bridge)).toBe(true);
    });

    it('supports array content with input_text items', () => {
      const bridge = 'line1\nline2';
      const content = [
        { type: 'input_text', text: 'line1' },
        { type: 'input_text', text: 'line2' },
      ];
      const input = [
        { type: 'message', role: 'developer', content },
      ];
      expect(hasBridgePromptInConversation(input as any[], bridge)).toBe(true);
    });

    it('scans all messages for bridge prompt', () => {
      const bridge = 'BRIDGE';
      // Place bridge at the 6th from the end => should detect (now scanning all messages)
      const pre = new Array(6).fill(0).map((_, i) => ({ type: 'message', role: 'user', content: `u${i}` }));
      pre[0] = { type: 'message', role: 'system', content: bridge }; // far back
      const tail = [
        { type: 'message', role: 'user', content: 'a' },
        { type: 'message', role: 'assistant', content: 'b' },
        { type: 'message', role: 'user', content: 'c' },
        { type: 'message', role: 'assistant', content: 'd' },
        { type: 'message', role: 'user', content: 'e' },
      ];
      const input = [...pre, ...tail];
      expect(hasBridgePromptInConversation(input as any[], bridge)).toBe(true);

      // Bridge anywhere in conversation should be detected
      const input2 = input.slice();
      input2[input2.length - 5] = { type: 'message', role: 'system', content: bridge } as any;
      expect(hasBridgePromptInConversation(input2 as any[], bridge)).toBe(true);
    });

    it('returns false when input is not an array or lacks system/developer messages', () => {
      expect(hasBridgePromptInConversation(undefined as any, 'x')).toBe(false);
      expect(hasBridgePromptInConversation([] as any[], 'x')).toBe(false);
      expect(
        hasBridgePromptInConversation([
          { type: 'message', role: 'user', content: 'x' },
        ] as any[], 'x')
      ).toBe(false);
    });
  });

  describe('generateInputHash', () => {
    it('creates identical hash for structurally equal inputs', () => {
      const a = [
        { type: 'message', role: 'user', content: 'hello' },
        { type: 'message', role: 'system', content: 'sys' },
      ];
      const b = [
        { type: 'message', role: 'user', content: 'hello' },
        { type: 'message', role: 'system', content: 'sys' },
      ];
      expect(generateInputHash(a as any[])).toBe(generateInputHash(b as any[]));
    });

    it('changes hash when content changes', () => {
      const a = [{ type: 'message', role: 'user', content: 'a' }];
      const b = [{ type: 'message', role: 'user', content: 'b' }];
      expect(generateInputHash(a as any[])).not.toBe(generateInputHash(b as any[]));
    });
  });

  describe('cacheBridgeDecision / getCachedBridgeDecision', () => {
    const TTL = 5 * 60 * 1000; // 5 min
    let baseNow: number;

    beforeEach(() => {
      vi.useFakeTimers();
      baseNow = Date.now();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns cached entry when toolCount matches and TTL valid', () => {
      const input = [{ type: 'message', role: 'user', content: 'x' }];
      const inputHash = generateInputHash(input as any[]);
      cacheBridgeDecision(inputHash, 3, true);

      vi.setSystemTime(baseNow + TTL - 1000);
      const entry = getCachedBridgeDecision(inputHash, 3);
      expect(entry).toBeTruthy();
      expect(entry?.toolCount).toBe(3);
    });

    it('returns null when toolCount differs or TTL expired', () => {
      const input = [{ type: 'message', role: 'user', content: 'x' }];
      const inputHash = generateInputHash(input as any[]);
      cacheBridgeDecision(inputHash, 2, false);

      // toolCount mismatch
      expect(getCachedBridgeDecision(inputHash, 3)).toBeNull();

      // within TTL w/ exact count works
      const inputHash2 = generateInputHash([{ type: 'message', role: 'user', content: 'y' }] as any[]);
      cacheBridgeDecision(inputHash2, 4, true);
      vi.setSystemTime(baseNow + TTL + 1);
      expect(getCachedBridgeDecision(inputHash2, 4)).toBeNull();
    });
  });
});
