# Hisaab- Household Finance Management

## Monorepo Structure

During review, scrutinize aggressively and flag potential violations of this structure (particularly the code practices)

## MCP Servers

### Chrome Devtools MCP server

Use whenever you need to interact with the frontend apps directly, e.g. to debug a frontend app or to inspect the frontend app's state.

The devtools MCP server (`devtools-mcp`) is configured in `.mcp.json`.
Use `admin` for both username and password to login

## Skill Loading for Tanstack libraries (@tanstack/react-query, @tanstack/react-table, @tanstack/react-virtual, etc.)

Before editing files for a substantial task involving one of the tanstack libraries:

- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

## Dependency Management

Always use exact versions and pnpm catalogs — never write a version directly in `package.json`.

**Never** override pnpm's `minimumReleaseAge` setting.

## Current Development Focus

Information related to the current development focus can be found in `./current-development-focus.md`.

## Communication Style

Caveman skill (`/caveman` skill) always active.

## Agent skills

### Issue tracker

GitHub Issues (khanate-dev/hisaab) via `gh` CLI; external PRs are not a triage surface. See `.claude/docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `.claude/docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `.claude/docs/adr/` at repo root. See `.claude/docs/agents/domain.md`.
