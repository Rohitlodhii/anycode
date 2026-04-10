# Design Document: Fix Model Field Error

## Overview

This design addresses the issue where the Codex agent sends `null` values for optional fields in JSON-RPC requests, causing the server to reject them with "missing field" errors. The Codex server expects optional fields to be completely omitted from the JSON payload rather than sent with `null` values.

The solution implements a utility function to filter out null/undefined values from request parameters before serialization. This ensures that only fields with actual values are included in the JSON-RPC requests, maintaining backward compatibility while fixing the server rejection errors.

## Architecture

The fix will be implemented at the point where request parameters are constructed, specifically in the `CodexAgent.send()` and `CodexAgent.start()` methods. A utility function will clean the parameters object by removing any properties with `null` or `undefined` values before passing them to the RPC layer.

**Design Decision**: We filter at the parameter construction level rather than in the RPC layer because:
1. It keeps the filtering logic close to where parameters are defined
2. It makes the intent explicit in the business logic
3. It allows different methods to have different filtering strategies if needed in the future
4. It maintains the RPC layer as a generic transport mechanism

### Component Flow

```
User Input → main.ts (IPC handler) → CodexAgent.send() → [Filter nulls] → CodexRpc.request() → JSON.stringify → Codex Server
                                   → CodexAgent.start() → [Filter nulls] → CodexRpc.request() → JSON.stringify → Codex Server
```

## Components and Interfaces

### 1. Utility Function: `removeNullFields`

A generic utility function that removes properties with `null` or `undefined` values from objects. This function operates at a single level (non-recursive) since the Codex request parameters are flat objects.

**Design Decision**: We use a non-recursive implementation because:
1. Codex request parameters are flat objects (no nested structures that need filtering)
2. Simpler implementation is easier to test and maintain
3. Better performance for the common case
4. If nested filtering is needed later, it can be added without breaking existing code

```typescript
function removeNullFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  }
  
  return result as Partial<T>;
}
```

### 2. Modified `CodexAgent.send()` Method

The `send()` method in `CodexAgent.ts` will use the utility function to clean parameters before sending:

```typescript
async send(text: string, options?: { 
  model?: string | null; 
  collaborationMode?: string | null; 
  approvalPolicy?: string | null; 
  effort?: string | null 
}) {
  if (!this.threadId) {
    throw new Error("Codex agent has not been started yet.");
  }

  const params = removeNullFields({
    approvalPolicy: options?.approvalPolicy ?? null,
    approvalsReviewer: null,
    collaborationMode: options?.collaborationMode
      ? { mode: options.collaborationMode, settings: {} }
      : null,
    cwd: null,
    effort: options?.effort ?? null,
    input: [
      {
        text,
        text_elements: [],
        type: "text",
      },
    ],
    model: options?.model ?? null,
    outputSchema: null,
    personality: null,
    sandboxPolicy: null,
    serviceTier: null,
    summary: null,
    threadId: this.threadId,
  });

  return this.rpc.request<v2.TurnStartResponse>("turn/start", params);
}
```

### 3. Modified `CodexAgent.start()` Method

Similarly, the `start()` method should also filter null values:

```typescript
async start(options: StartOptions) {
  await this.rpc.initialize("anycode-electron", "0.1.0");

  const params = removeNullFields({
    approvalPolicy: options.approvalPolicy ?? "on-request",
    approvalsReviewer: null,
    baseInstructions: null,
    config: null,
    cwd: options.cwd,
    developerInstructions: null,
    ephemeral: false,
    experimentalRawEvents: false,
    model: options.model ?? null,
    modelProvider: null,
    persistExtendedHistory: true,
    personality: null,
    sandbox: options.sandbox ?? "workspace-write",
    serviceName: "Anycode",
    serviceTier: null,
  });

  const response: v2.ThreadStartResponse =
    await this.rpc.request<v2.ThreadStartResponse>("thread/start", params);

  this.cwd = response.cwd;
  this.threadId = response.thread.id;
  return response;
}
```

## Data Models

No new data models are required. The existing TypeScript interfaces remain unchanged:

- `TurnStartParams` - Already defines optional fields correctly
- `ThreadStartParams` - Already defines optional fields correctly
- `StartOptions` - Existing interface for start method options

## Acceptance Criteria Testing Prework

Before defining correctness properties, let's analyze each acceptance criterion for testability:

### Requirement 1: Handle Optional Model Field

**1.1: WHEN a model parameter is null or undefined, THE Codex_Agent SHALL omit the model field from the Turn_Start_Request**

Thoughts: This is a rule that should apply to all possible null/undefined model values. We can generate random request parameters with null or undefined model values, apply the filtering, serialize to JSON, and verify the "model" field is not present in the JSON string.

Testable: yes - property

**1.2: WHEN a model parameter has a string value, THE Codex_Agent SHALL include the model field in the Turn_Start_Request**

Thoughts: This is a rule that should apply to all valid string model values. We can generate random string values for the model parameter, apply filtering, serialize to JSON, and verify the "model" field is present with the correct value.

Testable: yes - property

**1.3: WHEN sending a Turn_Start_Request, THE system SHALL not include fields with null values in the JSON payload**

Thoughts: This is a general rule about all fields in the request. We can generate random request parameters with various null values, apply filtering, serialize to JSON, and verify no field in the JSON has a null value.

Testable: yes - property

### Requirement 2: Handle Optional Parameters Consistently

**2.1: WHEN any optional parameter is null or undefined, THE Codex_Agent SHALL omit that field from request payloads**

Thoughts: This is the same as 1.1 but generalized to all optional parameters. We can test this by generating random request objects with various optional fields set to null/undefined, applying the filter, and verifying those fields are omitted.

Testable: yes - property

**2.2: WHEN constructing request parameters, THE system SHALL filter out null and undefined values before serialization**

Thoughts: This is testing the behavior of the removeNullFields function itself. We can generate random objects with null/undefined values and verify they are removed.

Testable: yes - property

**2.3: THE Codex_Agent SHALL apply consistent null-handling logic to all optional fields including collaborationMode, approvalPolicy, effort, cwd, sandboxPolicy, serviceTier, personality, and outputSchema**

Thoughts: This is verifying that the filtering applies uniformly to all named fields. We can test this by creating request objects with each of these fields set to null, applying the filter, and verifying all are omitted.

Testable: yes - property

### Requirement 3: Preserve Existing Functionality

**3.1: WHEN a Turn_Start_Request is sent with valid parameters, THE system SHALL successfully initiate a conversation turn**

Thoughts: This is an integration test requirement. We need to verify that after filtering, required fields like threadId and input are still present and the request succeeds.

Testable: yes - property

**3.2: WHEN optional parameters are provided with valid values, THE system SHALL include them in the request**

Thoughts: This is testing that non-null values are preserved. We can generate random valid values for optional parameters and verify they remain after filtering.

Testable: yes - property

**3.3: THE system SHALL maintain backward compatibility with existing code that calls the send method**

Thoughts: This is about API compatibility, not a functional property we can test automatically. The method signature remains the same, so this is verified by code review.

Testable: no

## Property Reflection

After analyzing all testable criteria, let's identify any redundancy:

- Properties 1.1 and 2.1 are essentially the same (null/undefined values omitted) - can be combined
- Properties 1.3 and 2.2 overlap significantly (filtering null values) - can be combined
- Property 2.3 is a specific instance of 2.1 for named fields - can be tested as part of the general property
- Properties 1.2 and 3.2 both test preservation of valid values - can be combined

**Consolidated Properties:**
1. Null/undefined fields are omitted (covers 1.1, 2.1, 2.3)
2. Non-null fields are preserved (covers 1.2, 3.2)
3. Required fields always present (covers 3.1)
4. No null values in serialized JSON (covers 1.3, 2.2)

## Correctness Properties

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Null and undefined fields are omitted

*For any* request parameters object containing null or undefined values, after applying `removeNullFields` and serializing to JSON, the resulting JSON string should not contain any properties that had null or undefined values in the original object.

**Validates: Requirements 1.1, 2.1, 2.3**

### Property 2: Non-null fields are preserved with correct values

*For any* request parameters object, after applying `removeNullFields`, all properties with non-null, non-undefined values should be present in the resulting object with their original values unchanged.

**Validates: Requirements 1.2, 3.2**

### Property 3: Required fields are always present

*For any* turn/start request with a valid threadId and input, after applying `removeNullFields`, the `threadId` and `input` fields should always be present in the final request parameters.

**Validates: Requirements 3.1**

### Property 4: Serialized JSON contains no null values

*For any* request parameters object, after applying `removeNullFields` and serializing to JSON, the resulting JSON string should not contain the substring `"null"` as a field value.

**Validates: Requirements 1.3, 2.2**

## Error Handling

### Existing Error Handling

The existing error handling in `CodexAgent` and `CodexRpc` remains sufficient:

- Connection errors are handled by `CodexProcess`
- RPC errors are handled by `CodexRpc.route()`
- Request timeouts are handled by the pending request map

### No New Error Cases

The `removeNullFields` utility is a pure function that cannot fail. It simply filters object properties, so no new error handling is required.

## Testing Strategy

### Dual Testing Approach

This feature will use both unit tests and property-based tests:
- **Unit tests**: Verify specific examples, edge cases, and integration points
- **Property tests**: Verify universal properties across all inputs using randomized testing

### Unit Tests

1. **Test `removeNullFields` utility**
   - Test with object containing only null values → expect empty object
   - Test with object containing only undefined values → expect empty object
   - Test with object containing only non-null values → expect all values preserved
   - Test with mixed null and non-null values → expect only non-null values
   - Test with empty object → expect empty object

2. **Test `CodexAgent.send()` parameter construction**
   - Test with no options provided → verify required fields present, optional fields omitted
   - Test with all options as null → verify only required fields present
   - Test with all options as valid strings → verify all fields present
   - Test with mixed null and valid options → verify only valid options included

3. **Test `CodexAgent.start()` parameter construction**
   - Test with minimal options → verify required fields present
   - Test with all optional fields as null → verify only required fields present
   - Test with all optional fields provided → verify all fields present

4. **Integration test for request serialization**
   - Mock the RPC layer
   - Verify the serialized JSON payload does not contain null values
   - Verify required fields are always present in JSON

### Property-Based Tests

Property-based tests will use fast-check (TypeScript property testing library) to validate correctness properties across many randomly generated inputs.

**Configuration**: Each property test must run a minimum of 100 iterations.

**Test 1: Null and undefined fields are omitted**
- Generate random objects with various combinations of null, undefined, and valid values
- Apply `removeNullFields` and serialize to JSON
- Assert the JSON string does not contain properties that were null/undefined
- **Tag**: Feature: fix-model-field-error, Property 1: Null and undefined fields are omitted

**Test 2: Non-null fields are preserved with correct values**
- Generate random objects with non-null values (strings, numbers, objects, arrays)
- Apply `removeNullFields`
- Assert all original properties are present with unchanged values
- **Tag**: Feature: fix-model-field-error, Property 2: Non-null fields are preserved with correct values

**Test 3: Required fields are always present**
- Generate random send options (with various null/valid combinations)
- Construct turn/start parameters with valid threadId and input
- Apply `removeNullFields`
- Assert `threadId` and `input` are always present
- **Tag**: Feature: fix-model-field-error, Property 3: Required fields are always present

**Test 4: Serialized JSON contains no null values**
- Generate random request parameters with various null values
- Apply `removeNullFields` and serialize to JSON
- Assert the JSON string does not contain `:null` patterns
- **Tag**: Feature: fix-model-field-error, Property 4: Serialized JSON contains no null values
