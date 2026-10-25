import * as RadioGroupPrimitive from "@rn-primitives/radio-group";
import type { ReactNode } from "react";

import { Text } from "./text";

type Props<T extends string> = {
	label: string;
	value: T;
	onValueChange: (value: T) => void;
	options: readonly {
		value: T;
		/** The option's accessible name, and what it shows unless it has `content`. */
		label: string;
		/** Shown in place of the label, say an icon or a swatch; told whether it's the chosen one. */
		content?: (selected: boolean) => ReactNode;
	}[];
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
		{options.map((option) => {
			const selected = option.value === value;
			return (
				<RadioGroupPrimitive.Item
					accessibilityLabel={option.label}
					aria-label={option.label}
					className={`rounded-full border-2 border-border ${option.content ? "p-2" : "ps-4 pe-4 py-2"} ${selected ? "bg-butter" : "bg-surface"}`}
					key={option.value}
					value={option.value}
				>
					{option.content ? (
						option.content(selected)
					) : (
						<Text
							className={selected ? "text-on-accent" : ""}
							variant="label"
						>
							{option.label}
						</Text>
					)}
				</RadioGroupPrimitive.Item>
			);
		})}
	</RadioGroupPrimitive.Root>
);
