import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { removeNullFields } from "@/utils/object";

describe("CodexAgent.send() method", () => {
	describe("Property-Based Tests", () => {
		/**
		 * Feature: fix-model-field-error
		 * Property 3: Required fields are always present
		 * Validates: Requirements 3.1
		 *
		 * For any turn/start request with a valid threadId and input,
		 * after applying removeNullFields, the threadId and input fields
		 * should always be present in the final request parameters.
		 */
		it("should always preserve required fields (threadId and input)", () => {
			fc.assert(
				fc.property(
					// Generate random threadId
					fc.string({ minLength: 1 }),
					// Generate random input text
					fc.string(),
					// Generate random optional fields (can be null or valid values)
					fc.record({
						model: fc.oneof(fc.constant(null), fc.string()),
						collaborationMode: fc.oneof(fc.constant(null), fc.string()),
						approvalPolicy: fc.oneof(fc.constant(null), fc.string()),
						effort: fc.oneof(fc.constant(null), fc.string()),
					}),
					(threadId, inputText, options) => {
						// Simulate the parameter construction in send() method
						const params = {
							approvalPolicy: options.approvalPolicy ?? null,
							approvalsReviewer: null,
							collaborationMode: options.collaborationMode
								? { mode: options.collaborationMode, settings: {} }
								: null,
							cwd: null,
							effort: options.effort ?? null,
							input: [
								{
									text: inputText,
									text_elements: [],
									type: "text",
								},
							],
							model: options.model ?? null,
							outputSchema: null,
							personality: null,
							sandboxPolicy: null,
							serviceTier: null,
							summary: null,
							threadId: threadId,
						};

						// Apply the filtering
						const filtered = removeNullFields(params);

						// Required fields must always be present
						expect(filtered).toHaveProperty("threadId");
						expect(filtered.threadId).toBe(threadId);
						expect(filtered).toHaveProperty("input");
						expect(filtered.input).toEqual([
							{
								text: inputText,
								text_elements: [],
								type: "text",
							},
						]);
					},
				),
				{ numRuns: 100 },
			);
		});

		/**
		 * Feature: fix-model-field-error
		 * Property 4: Serialized JSON contains no null values
		 * Validates: Requirements 1.3, 2.2
		 *
		 * For any request parameters object, after applying removeNullFields
		 * and serializing to JSON, the resulting JSON string should not contain
		 * the substring ":null" as a field value.
		 */
		it("should ensure serialized JSON contains no null values", () => {
			fc.assert(
				fc.property(
					// Generate random threadId
					fc.string({ minLength: 1 }),
					// Generate random input text
					fc.string(),
					// Generate random optional fields (can be null or valid values)
					fc.record({
						model: fc.oneof(fc.constant(null), fc.string()),
						collaborationMode: fc.oneof(fc.constant(null), fc.string()),
						approvalPolicy: fc.oneof(fc.constant(null), fc.string()),
						effort: fc.oneof(fc.constant(null), fc.string()),
						cwd: fc.oneof(fc.constant(null), fc.string()),
						outputSchema: fc.oneof(fc.constant(null), fc.record({ type: fc.string() })),
						personality: fc.oneof(fc.constant(null), fc.string()),
						sandboxPolicy: fc.oneof(fc.constant(null), fc.string()),
						serviceTier: fc.oneof(fc.constant(null), fc.string()),
						summary: fc.oneof(fc.constant(null), fc.string()),
					}),
					(threadId, inputText, options) => {
						// Simulate the parameter construction in send() method
						const params = {
							approvalPolicy: options.approvalPolicy ?? null,
							approvalsReviewer: null,
							collaborationMode: options.collaborationMode
								? { mode: options.collaborationMode, settings: {} }
								: null,
							cwd: options.cwd ?? null,
							effort: options.effort ?? null,
							input: [
								{
									text: inputText,
									text_elements: [],
									type: "text",
								},
							],
							model: options.model ?? null,
							outputSchema: options.outputSchema ?? null,
							personality: options.personality ?? null,
							sandboxPolicy: options.sandboxPolicy ?? null,
							serviceTier: options.serviceTier ?? null,
							summary: options.summary ?? null,
							threadId: threadId,
						};

						// Apply the filtering
						const filtered = removeNullFields(params);

						// Serialize to JSON
						const serialized = JSON.stringify(filtered);

						// The JSON should not contain ":null" patterns
						expect(serialized).not.toContain(":null");
						
						// Also verify that the word "null" doesn't appear as a value
						// (it could appear in strings, but not as a JSON null value)
						const nullValuePattern = /:\s*null[\s,}]/;
						expect(serialized).not.toMatch(nullValuePattern);
					},
				),
				{ numRuns: 100 },
			);
		});
	});

	describe("Unit Tests", () => {
		/**
		 * Test with no options provided
		 * Requirements: 1.1, 1.2, 3.2, 3.3
		 */
		it("should handle send() with no options provided", () => {
			const threadId = "test-thread-123";
			const inputText = "Hello, world!";

			// Simulate the parameter construction in send() method with no options
			const params = {
				approvalPolicy: null,
				approvalsReviewer: null,
				collaborationMode: null,
				cwd: null,
				effort: null,
				input: [
					{
						text: inputText,
						text_elements: [],
						type: "text",
					},
				],
				model: null,
				outputSchema: null,
				personality: null,
				sandboxPolicy: null,
				serviceTier: null,
				summary: null,
				threadId: threadId,
			};

			// Apply the filtering
			const filtered = removeNullFields(params);

			// Should only have required fields
			expect(filtered).toHaveProperty("threadId");
			expect(filtered).toHaveProperty("input");
			
			// Should not have optional fields that were null
			expect(filtered).not.toHaveProperty("model");
			expect(filtered).not.toHaveProperty("approvalPolicy");
			expect(filtered).not.toHaveProperty("collaborationMode");
			expect(filtered).not.toHaveProperty("effort");
			
			// Verify JSON doesn't contain null
			const serialized = JSON.stringify(filtered);
			expect(serialized).not.toContain(":null");
		});

		/**
		 * Test with all options as null
		 * Requirements: 1.1, 1.2, 3.2, 3.3
		 */
		it("should handle send() with all options as null", () => {
			const threadId = "test-thread-456";
			const inputText = "Test message";
			const options = {
				model: null,
				collaborationMode: null,
				approvalPolicy: null,
				effort: null,
			};

			// Simulate the parameter construction in send() method
			const params = {
				approvalPolicy: options.approvalPolicy ?? null,
				approvalsReviewer: null,
				collaborationMode: options.collaborationMode
					? { mode: options.collaborationMode, settings: {} }
					: null,
				cwd: null,
				effort: options.effort ?? null,
				input: [
					{
						text: inputText,
						text_elements: [],
						type: "text",
					},
				],
				model: options.model ?? null,
				outputSchema: null,
				personality: null,
				sandboxPolicy: null,
				serviceTier: null,
				summary: null,
				threadId: threadId,
			};

			// Apply the filtering
			const filtered = removeNullFields(params);

			// Should only have required fields
			expect(filtered).toHaveProperty("threadId");
			expect(filtered).toHaveProperty("input");
			expect(Object.keys(filtered).length).toBe(2);
		});

		/**
		 * Test with all options as valid strings
		 * Requirements: 1.1, 1.2, 3.2, 3.3
		 */
		it("should handle send() with all options as valid strings", () => {
			const threadId = "test-thread-789";
			const inputText = "Another test";
			const options = {
				model: "gpt-4",
				collaborationMode: "autopilot",
				approvalPolicy: "auto-approve",
				effort: "high",
			};

			// Simulate the parameter construction in send() method
			const params = {
				approvalPolicy: options.approvalPolicy ?? null,
				approvalsReviewer: null,
				collaborationMode: options.collaborationMode
					? { mode: options.collaborationMode, settings: {} }
					: null,
				cwd: null,
				effort: options.effort ?? null,
				input: [
					{
						text: inputText,
						text_elements: [],
						type: "text",
					},
				],
				model: options.model ?? null,
				outputSchema: null,
				personality: null,
				sandboxPolicy: null,
				serviceTier: null,
				summary: null,
				threadId: threadId,
			};

			// Apply the filtering
			const filtered = removeNullFields(params);

			// Should have required fields
			expect(filtered).toHaveProperty("threadId");
			expect(filtered).toHaveProperty("input");
			
			// Should have all provided optional fields
			expect(filtered).toHaveProperty("model");
			expect(filtered.model).toBe("gpt-4");
			expect(filtered).toHaveProperty("approvalPolicy");
			expect(filtered.approvalPolicy).toBe("auto-approve");
			expect(filtered).toHaveProperty("collaborationMode");
			expect(filtered.collaborationMode).toEqual({ mode: "autopilot", settings: {} });
			expect(filtered).toHaveProperty("effort");
			expect(filtered.effort).toBe("high");
		});

		/**
		 * Test with mixed null and valid options
		 * Requirements: 1.1, 1.2, 3.2, 3.3
		 */
		it("should handle send() with mixed null and valid options", () => {
			const threadId = "test-thread-mixed";
			const inputText = "Mixed test";
			const options = {
				model: "claude-3",
				collaborationMode: null,
				approvalPolicy: "on-request",
				effort: null,
			};

			// Simulate the parameter construction in send() method
			const params = {
				approvalPolicy: options.approvalPolicy ?? null,
				approvalsReviewer: null,
				collaborationMode: options.collaborationMode
					? { mode: options.collaborationMode, settings: {} }
					: null,
				cwd: null,
				effort: options.effort ?? null,
				input: [
					{
						text: inputText,
						text_elements: [],
						type: "text",
					},
				],
				model: options.model ?? null,
				outputSchema: null,
				personality: null,
				sandboxPolicy: null,
				serviceTier: null,
				summary: null,
				threadId: threadId,
			};

			// Apply the filtering
			const filtered = removeNullFields(params);

			// Should have required fields
			expect(filtered).toHaveProperty("threadId");
			expect(filtered).toHaveProperty("input");
			
			// Should have only the non-null optional fields
			expect(filtered).toHaveProperty("model");
			expect(filtered.model).toBe("claude-3");
			expect(filtered).toHaveProperty("approvalPolicy");
			expect(filtered.approvalPolicy).toBe("on-request");
			
			// Should not have the null optional fields
			expect(filtered).not.toHaveProperty("collaborationMode");
			expect(filtered).not.toHaveProperty("effort");
			
			// Verify JSON doesn't contain null
			const serialized = JSON.stringify(filtered);
			expect(serialized).not.toContain(":null");
		});
	});
});
