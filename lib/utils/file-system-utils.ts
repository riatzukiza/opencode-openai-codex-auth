/**
 * File System Utilities
 *
 * Common file system operations used across the codebase
 * Provides standardized path handling and directory management
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * OpenCode directory base path
 */
export const OPENCODE_DIR = join(homedir(), ".opencode");

/**
 * Get standardized path to OpenCode subdirectories
 * @param segments - Path segments relative to .opencode directory
 * @returns Full path to specified location
 */
export function getOpenCodePath(...segments: string[]): string {
	return join(OPENCODE_DIR, ...segments);
}

/**
 * Ensure directory exists, create if it doesn't
 * @param dirPath - Directory path to ensure exists
 */
export function ensureDirectory(dirPath: string): void {
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath, { recursive: true });
	}
}

/**
 * Write file ensuring parent directory exists
 * @param filePath - Path to file to write
 * @param content - Content to write
 * @param encoding - File encoding (default: "utf8")
 */
export function safeWriteFile(filePath: string, content: string, encoding: BufferEncoding = "utf8"): void {
	const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
	if (dirPath) {
		ensureDirectory(dirPath);
	}
	writeFileSync(filePath, content, encoding);
}

/**
 * Read file if it exists, return null if not found
 * @param filePath - Path to file to read
 * @param encoding - File encoding (default: "utf8")
 * @returns File content or null if file doesn't exist
 */
export function safeReadFile(filePath: string, encoding: BufferEncoding = "utf8"): string | null {
	try {
		return existsSync(filePath) ? readFileSync(filePath, encoding) : null;
	} catch {
		return null;
	}
}

/**
 * Check if file exists and is not empty
 * @param filePath - Path to file to check
 * @returns True if file exists and has content
 */
export function fileExistsAndNotEmpty(filePath: string): boolean {
	try {
		const content = readFileSync(filePath, "utf8");
		return content.length > 0;
	} catch {
		return false;
	}
}
