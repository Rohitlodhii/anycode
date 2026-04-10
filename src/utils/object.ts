/**
 * Removes properties with null or undefined values from an object.
 * This is useful for cleaning request parameters before JSON serialization,
 * ensuring that optional fields are omitted rather than sent as null.
 *
 * @param obj - The object to filter
 * @returns A new object with null and undefined properties removed
 *
 * @example
 * ```typescript
 * const input = { a: 1, b: null, c: undefined, d: "hello" };
 * const output = removeNullFields(input);
 * // output: { a: 1, d: "hello" }
 * ```
 */
export function removeNullFields<T extends Record<string, unknown>>(
	obj: T,
): Partial<T> {
	// Use a null-prototype object so keys like "valueOf" don't exist on the prototype.
	const result: Record<string, unknown> = Object.create(null) as Record<
		string,
		unknown
	>;

	for (const [key, value] of Object.entries(obj)) {
		if (value !== null && value !== undefined) {
			result[key] = value;
		}
	}

	return result as Partial<T>;
}
