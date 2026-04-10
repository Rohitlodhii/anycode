# Requirements Document: Fix Model Field Error

## Introduction

The Codex agent integration is failing when sending turn/start requests because the `model` field is being sent as `null` instead of being omitted when no model is specified. The Codex server expects optional fields to be omitted entirely rather than sent with `null` values.

## Glossary

- **Codex_Agent**: THE system component that manages communication with the Codex AI service
- **Turn_Start_Request**: THE JSON-RPC request sent to initiate a new conversation turn
- **Model_Field**: THE optional parameter specifying which AI model to use
- **JSON_RPC**: THE protocol used for communication between the client and Codex server

## Requirements

### Requirement 1: Handle Optional Model Field

**User Story:** As a developer, I want the Codex agent to correctly handle optional model parameters, so that turn/start requests succeed without errors.

#### Acceptance Criteria

1. WHEN a model parameter is null or undefined, THE Codex_Agent SHALL omit the model field from the Turn_Start_Request
2. WHEN a model parameter has a string value, THE Codex_Agent SHALL include the model field in the Turn_Start_Request
3. WHEN sending a Turn_Start_Request, THE system SHALL not include fields with null values in the JSON payload

### Requirement 2: Handle Optional Parameters Consistently

**User Story:** As a developer, I want all optional parameters to be handled consistently, so that the system is maintainable and predictable.

#### Acceptance Criteria

1. WHEN any optional parameter is null or undefined, THE Codex_Agent SHALL omit that field from request payloads
2. WHEN constructing request parameters, THE system SHALL filter out null and undefined values before serialization
3. THE Codex_Agent SHALL apply consistent null-handling logic to all optional fields including collaborationMode, approvalPolicy, effort, cwd, sandboxPolicy, serviceTier, personality, and outputSchema

### Requirement 3: Preserve Existing Functionality

**User Story:** As a user, I want the Codex agent to continue working as expected, so that my workflow is not disrupted.

#### Acceptance Criteria

1. WHEN a Turn_Start_Request is sent with valid parameters, THE system SHALL successfully initiate a conversation turn
2. WHEN optional parameters are provided with valid values, THE system SHALL include them in the request
3. THE system SHALL maintain backward compatibility with existing code that calls the send method
