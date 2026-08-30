# Sooperwizer — Claude Code Project Instructions

## Monorepo Structure

Full documentation of all apps, packages, infrastructure, and coding practices is in `.claude/docs/monorepo-structure.md`. Read it when working on an unfamiliar app, adding a new package dependency, or answering architecture questions.

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

## Content & i18n

Avoid adding content string directly in code. Instead, use `t` and `tList` from `@pkg/content` to access localized strings.

How `content.json` is structured, how to add new content keys, `TTranslateFn`/`TBaseArgs`/RTL inversion, `tList`, the `gen:content` code-gen script, and `createLocale` usage are all in `.claude/docs/content-i18n.md`.

Read it when adding content keys, working with i18n/localization, or using `t`/`tList`.

Pay special attention to the content issues when reviewing code. Be aggressive and flag issues, duplication, and potential improvements based on `.claude/docs/content-i18n.md`

## Testing Conventions

Test structure, naming rules, type-test patterns, and Vitest config are in `.claude/docs/testing.md`.

Read it when writing or reviewing tests.

## Linting

ESLint config, custom `@pkg/eslint-rules` rules, knip (unused files/exports/deps), syncpack, cspell, and prettier — what each checks, how they're configured, and why (e.g. per-workspace `tsconfig.knip.json`) — are all documented in `.claude/docs/linting.md`.

Read it when adding/editing lint rules, investigating a lint failure's root config, or reviewing code for lint-adjacent issues (unused code, dependency versions, spelling).

## Dependency Management

Always use exact versions and pnpm catalogs — never write a version directly in `package.json`.

**Never** override pnpm's `minimumReleaseAge` setting.

## Current Development Focus

Information related to the current development focus can be found in `./current-development-focus.md`.

## Communication Style

Caveman skill (`/caveman` skill) always active.

## Agent skills

### Issue tracker

GitHub Issues (WiMetrixDev/sooperwizer) via `gh` CLI; external PRs are not a triage surface. See `.claude/docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `.claude/docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `.claude/docs/adr/` at repo root. See `.claude/docs/agents/domain.md`.
