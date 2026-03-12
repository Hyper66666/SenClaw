> Alignment note: core CLI commands are implemented and documented in `packages/cli`; automated command tests and npm publication workflow are still open.

## 1. CLI Scaffold

- [x] 1.1 Create `packages/cli` with TypeScript + Commander.js.
- [x] 1.2 Add dependencies: `commander`, `inquirer`, `ora`, `chalk`, `axios`.
- [x] 1.3 Set up bin entry point: `senclaw` command.

## 2. Configuration

- [x] 2.1 Read config from `~/.senclawrc` (JSON): gateway URL, API key.
- [x] 2.2 Add `senclaw config set <key> <value>` command.
- [x] 2.3 Add `senclaw config get <key>` command.

## 3. Agent Commands

- [x] 3.1 `senclaw agent create` - Interactive prompts for name, prompt, provider.
- [x] 3.2 `senclaw agent list` - Table output with agent names, IDs, providers.
- [x] 3.3 `senclaw agent get <id>` - Display full agent details.
- [x] 3.4 `senclaw agent delete <id>` - Confirm and delete.

## 4. Task Commands

- [x] 4.1 `senclaw task submit <agent-id>` - Prompt for input, submit task, show run ID.
- [x] 4.2 `senclaw task submit <agent-id> --input "text"` - Non-interactive mode.

## 5. Run Commands

- [x] 5.1 `senclaw run get <run-id>` - Display run status, timestamps.
- [x] 5.2 `senclaw run logs <run-id>` - Display message history.
- [x] 5.3 `senclaw run logs <run-id> --follow` - Poll for updates, live stream.

## 6. Health Command

- [x] 6.1 `senclaw health` - Display system health status.

## 7. Error Handling

- [x] 7.1 Handle API errors gracefully (network, 404, 500).
- [x] 7.2 Display user-friendly error messages.

## 8. Testing

- [ ] 8.1 Unit tests for command parsing.
- [ ] 8.2 Integration tests with mock API.

## 9. Distribution

- [ ] 9.1 Publish to npm as `@senclaw/cli`.
- [x] 9.2 Add installation instructions to README.

