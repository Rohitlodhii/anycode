# Implementation Plan: Fix Model Field Error

## Overview

This implementation plan addresses the issue where the Codex agent sends `null` values for optional fields in JSON-RPC requests. The solution involves creating a utility function to filter out null/undefined values and applying it in the `CodexAgent.send()` and `CodexAgent.start()` methods.

## Tasks

- [x] 1. Create utility function for filtering null fields
  - Create `removeNullFields` function in a new utility file
  - Function should remove properties with null or undefined values
  - Function should preserve all non-null values unchanged
  - Function should work with generic object types
  - _Requirements: 2.1, 2.2_

- [x] 1.1 Write property test for null field removal
  - **Property 1: Null and undefined fields are omitted**
  - **Validates: Requirements 1.1, 2.1, 2.3**

- [x] 1.2 Write property test for value preservation
  - **Property 2: Non-null fields are preserved with correct values**
  - **Validates: Requirements 1.2, 3.2**

- [x] 1.3 Write unit tests for removeNullFields utility
  - Test with object containing only null values
  - Test with object containing only undefined values
  - Test with mixed null and non-null values
  - Test with empty object
  - _Requirements: 2.1, 2.2_

- [-] 2. Update CodexAgent.send() method
  - Import the `removeNullFields` utility function
  - Apply `removeNullFields` to the parameters object before passing to RPC
  - Ensure all optional fields (model, collaborationMode, approvalPolicy, effort, cwd, outputSchema, personality, sandboxPolicy, serviceTier, summary) are handled
  - Maintain existing method signature for backward compatibility
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.3_

- [x] 2.1 Write property test for required fields preservation
  - **Property 3: Required fields are always present**
  - **Validates: Requirements 3.1**

- [x] 2.2 Write property test for JSON serialization
  - **Property 4: Serialized JSON contains no null values**
  - **Validates: Requirements 1.3, 2.2**

- [-] 2.3 Write unit tests for send() method
  - Test with no options provided
  - Test with all options as null
  - Test with all options as valid strings
  - Test with mixed null and valid options
  - _Requirements: 1.1, 1.2, 3.2, 3.3_

- [ ] 3. Update CodexAgent.start() method
  - Import the `removeNullFields` utility function (if not already imported)
  - Apply `removeNullFields` to the parameters object before passing to RPC
  - Ensure all optional fields are handled consistently
  - Maintain existing method signature for backward compatibility
  - _Requirements: 2.1, 2.2, 2.3, 3.3_

- [ ] 3.1 Write unit tests for start() method
  - Test with minimal options
  - Test with all optional fields as null
  - Test with all optional fields provided
  - _Requirements: 2.1, 2.2, 3.2, 3.3_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties across many inputs (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The checkpoint ensures incremental validation before completion
