// Device money is text; SQLite's SUM/AVG/TOTAL coerce it to a float. Aggregate through the Money type instead.
// Non-money aggregates must opt out with an eslint-disable comment that says why.

const DRIZZLE_AGGREGATES = new Set([
	"sum",
	"sumDistinct",
	"avg",
	"avgDistinct",
]);
// TOTAL needs its paren attached, so UI copy like "Total (PKR)" stays legal.
const SQL_AGGREGATE = /\b(?:sum|avg)\s*\(|\btotal\(/i;

const message =
	"Do not aggregate money in SQL on the device; sum Money values in TypeScript.";

/** @param {unknown} source */
const isDrizzle = (source) => String(source).startsWith("drizzle-orm");

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
		/** Local names bound by `import * as x from 'drizzle-orm'`. */
		const drizzleNamespaces = new Set();

		return {
			ImportDeclaration(node) {
				if (!isDrizzle(node.source.value)) return;
				for (const specifier of node.specifiers) {
					if (specifier.type === "ImportNamespaceSpecifier") {
						drizzleNamespaces.add(specifier.local.name);
					} else if (
						specifier.type === "ImportSpecifier" &&
						specifier.imported.type === "Identifier" &&
						DRIZZLE_AGGREGATES.has(specifier.imported.name)
					) {
						report(specifier);
					}
				}
			},
			MemberExpression(node) {
				if (
					node.object.type === "Identifier" &&
					drizzleNamespaces.has(node.object.name) &&
					node.property.type === "Identifier" &&
					DRIZZLE_AGGREGATES.has(node.property.name)
				) {
					report(node);
				}
			},
			Literal(node) {
				if (typeof node.value === "string" && SQL_AGGREGATE.test(node.value))
					report(node);
			},
			TemplateLiteral(node) {
				if (
					node.quasis.some((quasi) =>
						SQL_AGGREGATE.test(quasi.value.cooked ?? quasi.value.raw),
					)
				) {
					report(node);
				}
			},
		};
	},
};
