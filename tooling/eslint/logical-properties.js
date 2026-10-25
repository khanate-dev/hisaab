// ADR-0008: app styling uses logical properties only, so the layout mirrors for right-to-left languages (Urdu).
// Flags physical horizontal Tailwind classes and React Native style keys; block-axis (top/bottom) ones are fine,
// and symmetric ones (px, mx, inset-x) mirror by themselves.

/** Physical horizontal utilities, after any `md:`/`hover:` variant prefix and a leading `-`. */
const PHYSICAL_CLASS =
	/^-?(?:m[lr]|p[lr]|scroll-[mp][lr]|border-[lr]|rounded-(?:[lr]|[tb][lr])|text-(?:left|right)|left|right|float-(?:left|right)|clear-(?:left|right))(?:-|$)/;

/** Outside className, only the hyphenated forms count, so copy like "3 days left" never trips the rule. */
const PHYSICAL_CLASS_IN_STRING =
	/(?:^|\s|:)-?(?:m[lr]|p[lr]|border-[lr]|rounded-(?:[lr]|[tb][lr])|text-(?:left|right)|left|right)-\S*/;

const PHYSICAL_STYLE_KEYS = new Set([
	"marginLeft",
	"marginRight",
	"paddingLeft",
	"paddingRight",
	"left",
	"right",
	"borderLeftWidth",
	"borderRightWidth",
	"borderLeftColor",
	"borderRightColor",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderBottomLeftRadius",
	"borderBottomRightRadius",
]);

/** @param {string} value */
const physicalClasses = (value) =>
	value
		.split(/\s+/)
		.map((token) => token.slice(token.lastIndexOf(":") + 1))
		.filter((token) => PHYSICAL_CLASS.test(token));

/** @param {import('estree').Node & { parent?: import('estree').Node }} node */
const inStyle = (node) => {
	for (
		let current = node.parent;
		current;
		current = /** @type {any} */ (current).parent
	) {
		const anyNode = /** @type {any} */ (current);
		if (anyNode.type === "JSXAttribute")
			return /style$/i.test(anyNode.name?.name ?? "");
		if (
			anyNode.type === "CallExpression" &&
			anyNode.callee.type === "MemberExpression" &&
			anyNode.callee.object.name === "StyleSheet" &&
			anyNode.callee.property.name === "create"
		)
			return true;
	}
	return false;
};

/** @param {import('estree').Node & { parent?: any }} node */
const inClassName = (node) => {
	for (let current = node.parent; current; current = current.parent) {
		if (current.type === "JSXAttribute")
			return /className$/.test(current.name?.name ?? "");
	}
	return false;
};

/** @type {import('eslint').Rule.RuleModule} */
export const logicalProperties = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require logical (start/end) properties instead of left/right in app styling",
		},
		schema: [],
		messages: {
			physicalClass:
				"Use a logical class instead of `{{name}}` (ms/me, ps/pe, border-s/e, rounded-s/e, text-start/end, start/end).",
			physicalStyle:
				"Use a logical style key instead of `{{name}}` (marginStart, paddingEnd, borderStartWidth, start, …).",
			physicalAlign: 'Use textAlign "start" or "end" instead of "{{name}}".',
		},
	},
	create(context) {
		/** @param {import('estree').Node} node @param {string} text */
		const checkText = (node, text) => {
			if (inClassName(/** @type {any} */ (node))) {
				for (const name of physicalClasses(text))
					context.report({ node, messageId: "physicalClass", data: { name } });
			} else {
				const match = PHYSICAL_CLASS_IN_STRING.exec(text);
				if (match)
					context.report({
						node,
						messageId: "physicalClass",
						data: { name: match[0].trim() },
					});
			}
		};

		return {
			Literal(node) {
				if (typeof node.value === "string") checkText(node, node.value);
			},
			TemplateElement(node) {
				checkText(node, node.value.cooked ?? node.value.raw);
			},
			Property(node) {
				if (!inStyle(node)) return;
				const key =
					node.key.type === "Identifier"
						? node.key.name
						: node.key.type === "Literal"
							? String(node.key.value)
							: null;
				if (key && PHYSICAL_STYLE_KEYS.has(key))
					context.report({
						node,
						messageId: "physicalStyle",
						data: { name: key },
					});
				if (
					key === "textAlign" &&
					node.value.type === "Literal" &&
					(node.value.value === "left" || node.value.value === "right")
				)
					context.report({
						node,
						messageId: "physicalAlign",
						data: { name: node.value.value },
					});
			},
		};
	},
};
