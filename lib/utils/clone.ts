/**
 * Clone Utilities
 *
 * Centralized deep cloning functionality to eliminate code duplication
 * Uses structuredClone when available for performance, falls back to JSON methods
 */

/**
 * Deep clone function that uses the best available method
 * Note: Intended for JSON-serializable data (plain objects/arrays)
 * @param value - Value to clone
 * @returns Deep cloned value
 */
const STRUCTURED_CLONE = (globalThis as { structuredClone?: <U>(value: U) => U }).structuredClone;

export function deepClone<T>(value: T): T {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (typeof STRUCTURED_CLONE === "function") {
		return STRUCTURED_CLONE(value);
	}
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Clone an array of InputItems efficiently (expects a real array)
 * @param items - Array of InputItems to clone
 * @returns Cloned array
 */
export function cloneInputItems<T>(items?: T[] | null): T[] {
	if (items == null) {
		return [];
	}
	if (!Array.isArray(items)) {
		throw new TypeError("cloneInputItems expects an array");
	}
	if (items.length === 0) {
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
