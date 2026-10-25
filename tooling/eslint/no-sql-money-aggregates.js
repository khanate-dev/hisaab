// Device money is text; SQLite's SUM/AVG/TOTAL coerce it to a float. Aggregate through the Money type instead.
// Non-money aggregates must opt out with an eslint-disable comment that says why.

const DRIZZLE_AGGREGATES = new Set([
	"sum",
	"sumDistinct",
	"avg",
	"avgDistinct",
]);
// Plain strings need the call paren attached, so UI copy like "Total (PKR)" stays legal.
const IN_STRING = /\b(?:sum|avg|total)\(/i;
const IN_SQL_TEMPLATE = /\b(?:sum|avg|total)\s*\(/i;

const message =
	"Do not aggregate money in SQL on the device; sum Money values in TypeScript.";

/** @type {import('eslint').Rule.RuleModule} */
export const noSqlMoneyAggregates = {
	meta: {
		type: "problem",
		docs: { description: "Disallow SQL SUM/AVG/TOTAL in device code" },
		schema: [],
		messages: { aggregate: message },
	},
	create(context) {
		/** @param {import('estree').Node} node */
		const report = (node) => context.report({ node, messageId: "aggregate" });

		return {
			ImportDeclaration(node) {
				if (!String(node.source.value).startsWith("drizzle-orm")) return;
				for (const specifier of node.specifiers) {
					if (
						specifier.type === "ImportSpecifier" &&
						specifier.imported.type === "Identifier" &&
						DRIZZLE_AGGREGATES.has(specifier.imported.name)
					) {
						report(specifier);
					}
				}
			},
			Literal(node) {
				if (typeof node.value === "string" && IN_STRING.test(node.value))
					report(node);
			},
			TemplateLiteral(node) {
				const tagged = node.parent.type === "TaggedTemplateExpression";
				const pattern = tagged ? IN_SQL_TEMPLATE : IN_STRING;
				if (
					node.quasis.some((quasi) =>
						pattern.test(quasi.value.cooked ?? quasi.value.raw),
					)
				) {
					report(node);
				}
			},
		};
	},
};
