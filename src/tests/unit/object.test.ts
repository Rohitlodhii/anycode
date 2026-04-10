import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { removeNullFields } from "@/utils/object";

describe("removeNullFields", () => {
	describe("Property-Based Tests", () => {
		/**
		 * Feature: fix-model-field-error
		 * Property 1: Null and undefined fields are omitted
		 * Validates: Requirements 1.1, 2.1, 2.3
		 *
		 * For any request parameters object containing null or undefined values,
		 * after applying removeNullFields and serializing to JSON, the resulting
		 * JSON string should not contain any properties that had null or undefined
		 * values in the original object.
		 */
		it("should omit null and undefined fields from any object", () => {
			fc.assert(
				fc.property(
					fc.dictionary(
						fc
							.string()
							.filter(
								(s) =>
									s !== "" && s !== "__proto__" && s !== "constructor",
							),
						fc.oneof(
							fc.constant(null),
							fc.constant(undefined),
							fc.string(),
							fc.integer(),
							fc.boolean(),
						),
					),
					(obj) => {
						const result = removeNullFields(obj);
						const serialized = JSON.stringify(result);

						// Check that no null/undefined keys from original are in result
						for (const [key, value] of Object.entries(obj)) {
							if (value === null || value === undefined) {
								expect(result).not.toHaveProperty(key);
								// Also verify it's not in the JSON string
								expect(serialized).not.toContain(`"${key}"`);
							}
						}
					},
				),
				{ numRuns: 100 },
			);
		});

		/**
		 * Feature: fix-model-field-error
		 * Property 2: Non-null fields are preserved with correct values
		 * Validates: Requirements 1.2, 3.2
		 *
		 * For any request parameters object, after applying removeNullFields,
		 * all properties with non-null, non-undefined values should be present
		 * in the resulting object with their original values unchanged.
		 */
		it("should preserve all non-null and non-undefined fields with correct values", () => {
			fc.assert(
				fc.property(
					fc.dictionary(
						fc.string().filter((s) => s !== "__proto__" && s !== "constructor"),
						fc.oneof(
							fc.constant(null),
							fc.constant(undefined),
							fc.string(),
							fc.integer(),
							fc.boolean(),
							fc.array(fc.string()),
							fc.record({ nested: fc.string() }),
						),
					),
					(obj) => {
						const result = removeNullFields(obj);

						// Check that all non-null/undefined values are preserved
						for (const [key, value] of Object.entries(obj)) {
							if (value !== null && value !== undefined) {
								expect(result).toHaveProperty(key);
								expect(result[key]).toEqual(value);
							}
						}
					},
				),
				{ numRuns: 100 },
			);
		});
	});


	describe("Unit Tests", () => {
		it("should return empty object when input contains only null values", () => {
			const input = { a: null, b: null, c: null };
			const result = removeNullFields(input);
			expect(result).toEqual({});
		});

		it("should return empty object when input contains only undefined values", () => {
			const input = { a: undefined, b: undefined, c: undefined };
			const result = removeNullFields(input);
			expect(result).toEqual({});
		});

		it("should handle mixed null and non-null values correctly", () => {
			const input = {
				a: "hello",
				b: null,
				c: 42,
				d: undefined,
				e: true,
				f: null,
			};
			const result = removeNullFields(input);
			expect(result).toEqual({
				a: "hello",
				c: 42,
				e: true,
			});
		});

		it("should return empty object when input is empty", () => {
			const input = {};
			const result = removeNullFields(input);
			expect(result).toEqual({});
		});

		it("should preserve complex values like arrays and objects", () => {
			const input = {
				arr: [1, 2, 3],
				obj: { nested: "value" },
				nullField: null,
				str: "test",
			};
			const result = removeNullFields(input);
			expect(result).toEqual({
				arr: [1, 2, 3],
				obj: { nested: "value" },
				str: "test",
			});
		});

		it("should preserve zero and false values", () => {
			const input = {
				zero: 0,
				falseBool: false,
				emptyString: "",
				nullField: null,
			};
			const result = removeNullFields(input);
			expect(result).toEqual({
				zero: 0,
				falseBool: false,
				emptyString: "",
			});
		});
	});
});
