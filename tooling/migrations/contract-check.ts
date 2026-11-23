// The contract guard (ADR-0009, ADR-0011; #67). Schema changes are expand/contract: a destructive change (a DROP, a SET
// NOT NULL, a tightened CHECK, a retype) or a `min_contract_version` raise can break app builds still in use, so a PR
// holding one must carry the `contract` label, and it then deploys through the `prod-contract` Environment.
//
//   node tooling/migrations/contract-check.ts check <base-ref>   (ci.yml, on a PR; LABELS holds its labels as JSON)
//   node tooling/migrations/contract-check.ts raise <from> <to>  (deploy.yml: the contract version a merge raises to)
//
// Only Node built-ins, so it runs straight from a checkout.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const CONTRACT_LABEL = "contract";

/**
 * The Squawk run by `pnpm dlx`, at least two weeks old as the catalog's are. It stays out of the workspace because adding
 * a dependency under pnpm 12 currently re-resolves the lockfile into duplicate peer copies (#115).
 */
const SQUAWK = "squawk-cli@2.72.0";

/** A finding from `squawk --reporter json`. */
export type SquawkViolation = {
	file: string;
	line: number;
	rule_name: string;
	message: string;
};

/**
 * Squawk's rules whose findings are contract changes; the rest of its advice (locks, timeouts, robustness) is only
 * shown. Its `constraint-missing-not-valid` is about locking, not contracts: a CHECK is judged below instead.
 */
export const CONTRACT_RULES = new Set([
	"ban-drop-column",
	"ban-drop-table",
	"ban-drop-database",
	"ban-truncate-cascade",
	"changing-column-type",
	"adding-not-nullable-field",
	"adding-required-field",
	"renaming-column",
	"renaming-table",
	"renaming-object",
]);

/** SQL without its comments, so a comment never trips or hides a check. Case is kept: quoted names keep theirs. */
const withoutComments = (sql: string) =>
	sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** A name as SQL compares it: quoted, exactly; unquoted, folded to lower case. */
const sqlName = (name: string) =>
	name.startsWith('"') ? name : name.toLowerCase();

const names = (text: string, pattern: RegExp) =>
	new Set([...text.matchAll(pattern)].map((m) => sqlName(m[1] ?? "")));

const NAME = String.raw`((?:"[^"]+"|[\w$]+)(?:\.(?:"[^"]+"|[\w$]+))?)`;

/** The contract version a migration raises `min_contract_version` to (an UPDATE's SET), or null if it doesn't. */
export const contractRaise = (sql: string): number | null => {
	const raises = [
		...withoutComments(sql).matchAll(
			/\bset\s+min_contract_version\s*=\s*(\d+)/gi,
		),
	].map((m) => Number(m[1]));
	return raises.length > 0 ? Math.max(...raises) : null;
};

/**
 * Why a migration is a contract change, beyond what Squawk finds (ADR-0009, ADR-0011): dropping a table, column, type,
 * view or schema; dropping a function (an RPC older builds call) or a policy it doesn't recreate under the same name;
 * altering a policy; a SET NOT NULL; a retype; a CHECK added to an existing table that doesn't replace one of the same
 * name, or validated; and a contract version raise. Replacing a CHECK under its own name is how a list of kinds grows
 * (expand), so it passes: narrowing one that way is the PR's to label.
 */
export const contractChanges = (sql: string): string[] => {
	const text = withoutComments(sql);
	const reasons: string[] = [];
	for (const [, what] of text.matchAll(
		/\bdrop\s+(table|column|type|view|materialized\s+view|schema)\b/gi,
	))
		reasons.push(`drops a ${(what ?? "").toLowerCase().replace(/\s+/g, " ")}`);

	const createdPolicies = names(
		text,
		new RegExp(String.raw`\bcreate\s+policy\s+("[^"]+"|\S+)`, "gi"),
	);
	for (const [, name = ""] of text.matchAll(
		/\bdrop\s+policy\s+(?:if\s+exists\s+)?("[^"]+"|\S+)/gi,
	))
		if (!createdPolicies.has(sqlName(name)))
			reasons.push(`drops the policy ${name}`);
	if (/\balter\s+policy\b/i.test(text)) reasons.push("alters a policy");

	const createdFunctions = names(
		text,
		new RegExp(
			String.raw`\bcreate\s+(?:or\s+replace\s+)?function\s+${NAME}`,
			"gi",
		),
	);
	for (const [, name = ""] of text.matchAll(
		new RegExp(
			String.raw`\bdrop\s+function\s+(?:if\s+exists\s+)?${NAME}`,
			"gi",
		),
	))
		if (!createdFunctions.has(sqlName(name)))
			reasons.push(`drops the function ${name}`);

	if (/\bset\s+not\s+null\b/i.test(text))
		reasons.push("sets a column NOT NULL");
	if (/\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i.test(text))
		reasons.push("changes a column's type");

	const droppedConstraints = names(
		text,
		new RegExp(
			String.raw`\bdrop\s+constraint\s+(?:if\s+exists\s+)?("[^"]+"|[\w$]+)`,
			"gi",
		),
	);
	for (const [, name = ""] of text.matchAll(
		new RegExp(
			String.raw`\balter\s+table\b[^;]*?\badd\s+constraint\s+("[^"]+"|[\w$]+)\s+check\b`,
			"gi",
		),
	))
		if (!droppedConstraints.has(sqlName(name)))
			reasons.push(`adds the CHECK ${name} to an existing table`);
	if (/\bvalidate\s+constraint\b/i.test(text))
		reasons.push("validates a constraint");

	const raise = contractRaise(sql);
	if (raise !== null) reasons.push(`raises min_contract_version to ${raise}`);
	return reasons;
};

/** Every reason a PR's migrations need the `contract` label, file by file. */
export const contractFindings = (
	migrations: { file: string; sql: string }[],
	squawk: SquawkViolation[],
) =>
	migrations.flatMap(({ file, sql }) => [
		...contractChanges(sql).map((reason) => `${file}: ${reason}`),
		...squawk
			.filter((v) => v.file.endsWith(file) && CONTRACT_RULES.has(v.rule_name))
			.map(
				(v) => `${file}:${v.line + 1}: ${v.message} (squawk ${v.rule_name})`,
			),
	]);

const git = (...args: string[]) => {
	const run = spawnSync("git", args, { encoding: "utf8" });
	if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
	return run.stdout.trim();
};

/** Migration files a range changed, each with its git status letter: A for added; anything else is a rewrite. */
const changedMigrations = (range: string) =>
	git(
		"diff",
		"--name-status",
		"--no-renames",
		range,
		"--",
		"supabase/migrations",
	)
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [status = "", file = ""] = line.split("\t");
			return { status, file };
		});

const check = (base: string) => {
	const labels = JSON.parse(process.env["LABELS"] ?? "[]") as string[];
	const changed = changedMigrations(`${base}...HEAD`);
	// A migration on main has run in prod already: editing it changes nothing there, only drifts.
	const rewritten = changed.filter((c) => c.status !== "A");
	for (const { file } of rewritten)
		console.log(
			`::error file=${file}::A merged migration changed; add a new migration instead`,
		);

	const added = changed
		.filter((c) => c.status === "A")
		.map(({ file }) => ({ file, sql: readFileSync(file, "utf8") }));
	let squawk: SquawkViolation[] = [];
	if (added.length > 0) {
		const run = spawnSync(
			"pnpm",
			[
				"--silent",
				"dlx",
				"--package",
				SQUAWK,
				"squawk",
				"--reporter",
				"json",
				...added.map((m) => m.file),
			],
			{
				encoding: "utf8",
				// Its own Actions annotations would land in the JSON; this prints the warnings itself.
				env: { ...process.env, SQUAWK_DISABLE_GITHUB_ANNOTATIONS: "true" },
			},
		);
		// Squawk exits 1 when it finds anything; anything else, or no JSON, means it didn't run: never a pass.
		if (
			run.error ||
			(run.status !== 0 && run.status !== 1) ||
			!run.stdout.trim()
		)
			throw new Error(`squawk didn't run: ${run.error?.message ?? run.stderr}`);
		squawk = JSON.parse(run.stdout) as SquawkViolation[];
		for (const v of squawk.filter((v) => !CONTRACT_RULES.has(v.rule_name)))
			console.log(
				`::warning file=${v.file},line=${v.line + 1}::${v.message} (squawk ${v.rule_name})`,
			);
	}

	const findings = contractFindings(added, squawk);
	for (const finding of findings) console.log(`contract change: ${finding}`);
	const unlabelled = findings.length > 0 && !labels.includes(CONTRACT_LABEL);
	if (unlabelled)
		console.log(
			`::error::These migrations are contract changes (ADR-0009): label the PR \`${CONTRACT_LABEL}\` so they deploy through prod-contract, or make them expand-only.`,
		);
	if (rewritten.length > 0 || unlabelled) process.exitCode = 1;
	else
		console.log(
			findings.length > 0
				? "Contract changes, labelled."
				: "No contract changes.",
		);
};

/** Prints the contract version the range's new migrations raise to, or nothing. */
const raise = (from: string, to: string) => {
	const raises = changedMigrations(`${from}..${to}`)
		.filter((c) => c.status === "A")
		.map(({ file }) => contractRaise(readFileSync(file, "utf8")))
		.filter((n): n is number => n !== null);
	if (raises.length > 0) console.log(Math.max(...raises));
};

if (import.meta.main) {
	const [command, ...args] = process.argv.slice(2);
	if (command === "check" && args[0]) check(args[0]);
	else if (command === "raise" && args[0] && args[1]) raise(args[0], args[1]);
	else {
		console.error(
			"usage: contract-check.ts check <base-ref> | raise <from> <to>",
		);
		process.exitCode = 2;
	}
}
