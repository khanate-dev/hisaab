import * as RadioGroupPrimitive from "@rn-primitives/radio-group";

import { Text } from "./text";

type Props<T extends string> = {
	label: string;
	value: T;
	onValueChange: (value: T) => void;
	options: readonly { value: T; label: string }[];
};

/** One choice from a few, shown as chips; the chosen one is filled. */
export const RadioGroup = <T extends string>({
	label,
	value,
	onValueChange,
	options,
}: Props<T>) => (
	<RadioGroupPrimitive.Root
		accessibilityLabel={label}
		aria-label={label}
		className="flex-row flex-wrap gap-2"
		// The primitive speaks plain strings; every value it hands back is one of `options`.
		onValueChange={(next) => onValueChange(next as T)}
		value={value}
	>
		{options.map((option) => (
			<RadioGroupPrimitive.Item
				accessibilityLabel={option.label}
				aria-label={option.label}
				className={`rounded-full border-2 border-border ps-4 pe-4 py-2 ${option.value === value ? "bg-butter" : "bg-surface"}`}
				key={option.value}
				value={option.value}
			>
				<Text
					className={option.value === value ? "text-on-accent" : ""}
					variant="label"
				>
					{option.label}
				</Text>
			</RadioGroupPrimitive.Item>
		))}
	</RadioGroupPrimitive.Root>
);
