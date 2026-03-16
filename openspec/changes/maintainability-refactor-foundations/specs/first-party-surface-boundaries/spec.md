## ADDED Requirements

### Requirement: CLI command actions share an API command boundary
First-party CLI commands that call the gateway SHALL use a shared command boundary for repeated API error handling and process exit behavior.

#### Scenario: A CLI API failure is handled through the shared boundary
- **WHEN** a CLI command performing an API call fails
- **THEN** the command routes the failure through the shared command boundary instead of duplicating local `try/catch + handleAPIError` boilerplate

### Requirement: Web query pages share a loading and error boundary pattern
First-party Web pages that are driven by query loading states SHALL use a shared boundary abstraction for repeated loading and error rendering patterns.

#### Scenario: A query-driven page renders through the shared boundary
- **WHEN** a Web page fetches list or detail data with loading and error states
- **THEN** it uses the shared loading or error boundary abstraction instead of duplicating the same conditional rendering structure
