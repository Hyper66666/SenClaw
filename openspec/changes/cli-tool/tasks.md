## 1. CLI Scaffold

- [ ] 1.1 Create `packages/cli` with TypeScript + Commander.js.
- [ ] 1.2 Add dependencies: `commander`, `inquirer`, `ora`, `chalk`, `axios`.
- [ ] 1.3 Set up bin entry point: `senclaw` command.

## 2. Configuration

- [ ] 2.1 Read config from `~/.senclawrc` (JSON): gateway URL, API key.
- [ ] 2.2 Add `senclaw config set <key> <value>` command.
- [ ] 2.3 Add `senclaw config get <key>` command.

## 3. Agent Commands

- [ ] 3.1 `senclaw agent create` - Interactive prompts for name, prompt, provider.
- [ ] 3.2 `senclaw agent list` - Table output with agent names, IDs, providers.
- [ ] 3.3 `senclaw agent get <id>` - Display full agent details.
- [ ] 3.4 `senclaw agent delete <id>` - Confirm and delete.

## 4. Task Commands

- [ ] 4.1 `senclaw task submit <agent-id>` - Prompt for input, submit task, show run ID.
- [ ] 4.2 `senclaw task submit <agent-id> --input "text"` - Non-interactive mode.

## 5. Run Commands

- [ ] 5.1 `senclaw run get <run-id>` - Display run status, timestamps.
- [ ] 5.2 `senclaw run logs <run-id>` - Display message history.
- [ ] 5.3 `senclaw run logs <run-id> --follow` - Poll for updates, live stream.

## 6. Health Command

- [ ] 6.1 `senclaw health` - Display system health status.

## 7. Error Handling

- [ ] 7.1 Handle API errors gracefully (network, 404, 500).
- [ ] 7.2 Display user-friendly error messages.

## 8. Testing

- [ ] 8.1 Unit tests for command parsing.
- [ ] 8.2 Integration tests with mock API.

## 9. Distribution

- [ ] 9.1 Publish to npm as `@senclaw/cli`.
- [ ] 9.2 Add installation instructions to README.
