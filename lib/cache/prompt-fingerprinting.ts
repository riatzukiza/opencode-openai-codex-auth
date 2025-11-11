/**
 * Prompt fingerprinting utilities
 * 
 * Provides content hashing to detect when prompts change,
 * avoiding redundant prompt injection in conversations.
 */

import { createHash } from "node:crypto";

/**
 * Generate SHA-256 hash of content
 * @param content - Text content to hash
 * @returns Hexadecimal hash string
 */
export function generateContentHash(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

/**
 * Check if bridge prompt is already in conversation
 * Uses content fingerprinting to avoid redundant injections
 * 
 * @param input - Input array from request
 * @param bridgeContent - Bridge prompt content to check for
 * @returns True if bridge prompt is already present
 */
export function hasBridgePromptInConversation(
	input: any[] | undefined,
	bridgeContent: string
): boolean {
	if (!Array.isArray(input)) return false;

	const bridgeHash = generateContentHash(bridgeContent);
	
	// Check all messages for bridge prompt (session-scoped, not just recent)
	for (const item of input) {
		if (item.type === "message" && 
			(item.role === "developer" || item.role === "system")) {
			
			const content = extractTextContent(item.content);
			if (content) {
				const contentHash = generateContentHash(content);
				if (contentHash === bridgeHash) {
					return true;
				}
			}
		}
	}
	
	return false;
}

/**
 * Extract text content from various content formats
 * @param content - Content object or string
 * @returns Text string or null
 */
function extractTextContent(content: any): string | null {
	if (typeof content === "string") {
		return content;
	}
	
	if (Array.isArray(content)) {
		const textItems = content.filter(item => 
			item.type === "input_text" && item.text
		);
		if (textItems.length > 0) {
			return textItems.map(item => item.text).join("\n");
		}
	}
	
	return null;
}

/**
 * Bridge prompt cache entry with metadata
 */
interface BridgeCacheEntry {
	hash: string;
	timestamp: number;
	toolCount: number;
}

/**
 * Simple cache for bridge prompt decisions
 */
const bridgeCache = new Map<string, BridgeCacheEntry>();

/**
 * Get cached bridge decision
 * @param inputHash - Hash of input array
 * @param toolCount - Number of tools in request
 * @returns Cached entry or null
 */
export function getCachedBridgeDecision(
	inputHash: string,
	toolCount: number
): BridgeCacheEntry | null {
	const entry = bridgeCache.get(inputHash);
	if (!entry) return null;
	
	// Return cached decision if tools haven't changed and within TTL
	const TTL_MS = 5 * 60 * 1000; // 5 minutes
	if (entry.toolCount === toolCount && 
		(Date.now() - entry.timestamp) < TTL_MS) {
		return entry;
	}
	
	// Invalidate stale entry
	bridgeCache.delete(inputHash);
	return null;
}

/**
 * Cache bridge decision
 * @param inputHash - Hash of input array
 * @param toolCount - Number of tools in request
 * @param shouldAddBridge - Whether bridge should be added
 */
export function cacheBridgeDecision(
	inputHash: string,
	toolCount: number,
	shouldAddBridge: boolean
): void {
	const entry: BridgeCacheEntry = {
		hash: generateContentHash(shouldAddBridge ? "add" : "skip"),
		timestamp: Date.now(),
		toolCount,
	};
	
	bridgeCache.set(inputHash, entry);
}

/**
 * Generate hash of input array for caching
 * @param input - Input array
 * @returns Hash string
 */
export function generateInputHash(input: any[] | undefined): string {
	if (!Array.isArray(input)) return "empty";
	
	// Create canonical representation for hashing
	const canonical = JSON.stringify(input.map(item => ({
		type: item.type,
		role: item.role,
		// Only hash first 100 chars of content to avoid excessive computation
		content: typeof item.content === "string" 
			? item.content.substring(0, 100)
			: item.content ? JSON.stringify(item.content).substring(0, 100) : "",
	})));
	
	return generateContentHash(canonical);
}