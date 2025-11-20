/**
 * Input Item Utilities
 *
 * Centralized utilities for working with InputItem objects
 * Eliminates duplication across modules
 */

import type { InputItem } from "../types.js";

/**
 * Extract text content from an InputItem
 * Handles both string and array content formats
 * @param item - InputItem to extract text from
 * @returns Extracted text content
 */
export function extractTextFromItem(item: InputItem): string {
	if (typeof item.content === "string") {
		return item.content;
	}
	if (Array.isArray(item.content)) {
		return item.content
			.filter((c) => c.type === "input_text" && c.text)
			.map((c) => c.text)
			.join("\n");
	}
	return "";
}

/**
 * Check if an InputItem has text content
 * @param item - InputItem to check
 * @returns True if item has non-empty text content
 */
export function hasTextContent(item: InputItem): boolean {
	return extractTextFromItem(item).length > 0;
}

/**
 * Format role name for display
 * @param role - Role string from InputItem
 * @returns Formatted role name or empty string if invalid
 */
export function formatRole(role: string): string {
	const normalized = (role ?? "").trim();
	if (!normalized) return "";
	return normalized;
}

/**
 * Create a formatted conversation entry
 * @param role - Role name
 * @param text - Text content
 * @returns Formatted entry string
 */
export function formatEntry(role: string, text: string): string {
	return `[${role}]: ${text}`;
}

/**
 * Check if an InputItem is a system message
 * @param item - InputItem to check
 * @returns True if item is a system/developer role
 */
export function isSystemMessage(item: InputItem): boolean {
	return item.role === "developer" || item.role === "system";
}

/**
 * Check if an InputItem is a user message
 * @param item - InputItem to check
 * @returns True if item is a user role
 */
export function isUserMessage(item: InputItem): boolean {
	return item.role === "user";
}

/**
 * Check if an InputItem is an assistant message
 * @param item - InputItem to check
 * @returns True if item is an assistant role
 */
export function isAssistantMessage(item: InputItem): boolean {
	return item.role === "assistant";
}

/**
 * Filter items by role
 * @param items - Array of InputItems
 * @param role - Role to filter by
 * @returns Filtered array of items
 */
export function filterByRole(items: InputItem[], role: string): InputItem[] {
	return items.filter((item) => item.role === role);
}

/**
 * Get the last user message from an array of InputItems
 * @param items - Array of InputItems
 * @returns Last user message or undefined if none found
 */
export function getLastUserMessage(items: InputItem[]): InputItem | undefined {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (item && isUserMessage(item)) {
			return item;
		}
	}
	return undefined;
}

/**
 * Count conversation turns (user + assistant messages)
 * @param items - Array of InputItems
 * @returns Number of conversation turns
 */
export function countConversationTurns(items: InputItem[]): number {
	return items.filter((item) => isUserMessage(item) || isAssistantMessage(item)).length;
}
