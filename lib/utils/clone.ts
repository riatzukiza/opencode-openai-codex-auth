/**
 * Clone Utilities
 * 
 * Centralized deep cloning functionality to eliminate code duplication
 * Uses structuredClone when available for performance, falls back to JSON methods
 */

/**
 * Deep clone function that uses the best available method
 * @param value - Value to clone
 * @returns Deep cloned value
 */
export function deepClone<T>(value: T): T {
	const globalClone = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone;
	if (typeof globalClone === "function") {
		return globalClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Clone an array of InputItems efficiently
 * @param items - Array of InputItems to clone
 * @returns Cloned array
 */
export function cloneInputItems<T>(items: T[]): T[] {
	if (!Array.isArray(items) || items.length === 0) {
		return [];
	}
	return items.map((item) => deepClone(item));
}

/**
 * Clone a single InputItem
 * @param item - InputItem to clone
 * @returns Cloned InputItem
 */
export function cloneInputItem<T>(item: T): T {
	return deepClone(item);
}