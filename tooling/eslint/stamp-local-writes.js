// ADR-0009: every local insert or update of a synced table carries the contract version it was written under, so a
// later build can upcast the queued op. Drizzle writes must pass their values through `stamped()`, and deletes are
// `update(...).set(stampedDelete())`, so they carry a stamp too: a Drizzle `delete(table).where()` carries none.
// Raw SQL writes (`db.execute`) aren't checked; the app writes through Drizzle.

/** Local-only tables never upload, so their writes need no stamp. */
const LOCAL_ONLY = new Set(["uploadErrors", "deviceState"]);

/** @param {import('estree').Node} node */
const isStamped = (node) =>
	node.type === "CallExpression" &&
	node.callee.type === "Identifier" &&
	(node.callee.name === "stamped" || node.callee.name === "stampedDelete");

/** @param {import('estree').Node} node */
const isStampedValues = (node) =>
	isStamped(node) ||
	(node.type === "ArrayExpression" &&
		node.elements.every((element) => element !== null && isStamped(element)));

/** @type {Record<string, string>} The write a values-method finishes: `insert(...).values()`, `update(...).set()`. */
const WRITES = { values: "insert", set: "update" };

/** @type {import('eslint').Rule.RuleModule} */
export const stampLocalWrites = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require stamped() on Drizzle inserts and updates of synced tables",
		},
		schema: [],
		messages: {
			unstamped:
				"Pass the values through stamped() so the queued op carries its contract version.",
			unstampedDelete:
				"Delete with update(table).set(stampedDelete()) so the queued DELETE carries its stamp.",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const { callee } = node;
				if (
					callee.type !== "MemberExpression" ||
					callee.property.type !== "Identifier"
				)
					return;
				const target = callee.object;
				// `x.delete(table).where(...)`: a Drizzle delete (a Set's or Map's delete has no `.where`).
				if (
					callee.property.name === "where" &&
					target.type === "CallExpression" &&
					target.callee.type === "MemberExpression" &&
					target.callee.property.type === "Identifier" &&
					target.callee.property.name === "delete"
				) {
					const [deleted] = target.arguments;
					if (!(deleted?.type === "Identifier" && LOCAL_ONLY.has(deleted.name)))
						context.report({ node, messageId: "unstampedDelete" });
					return;
				}
				const write = WRITES[callee.property.name];
				if (
					!write ||
					target.type !== "CallExpression" ||
					target.callee.type !== "MemberExpression" ||
					target.callee.property.type !== "Identifier" ||
					target.callee.property.name !== write
				)
					return;
				const [table] = target.arguments;
				if (table?.type === "Identifier" && LOCAL_ONLY.has(table.name)) return;
				const [values] = node.arguments;
				if (
					values &&
					values.type !== "SpreadElement" &&
					isStampedValues(values)
				)
					return;
				context.report({ node, messageId: "unstamped" });
			},
		};
	},
};
