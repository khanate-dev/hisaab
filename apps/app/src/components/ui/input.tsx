import { TextInput, type TextInputProps, View } from "react-native";

import { useColors } from "@/theme/theme";

import { Text } from "./text";

type Props = Omit<TextInputProps, "accessibilityLabel"> & {
	/** Shown above the field and used as its accessible name. */
	label: string;
	error?: string | undefined;
	/** Shown under the field and read with it. */
	hint?: string | undefined;
};

export const Input = ({
	label,
	error,
	hint,
	className = "",
	...props
}: Props) => {
	const colors = useColors();
	return (
		<View className="gap-1">
			<Text variant="label">{label}</Text>
			<TextInput
				accessibilityHint={error ?? hint}
				accessibilityLabel={label}
				className={`min-h-12 rounded-control border-2 bg-surface-2 ps-3 pe-3 py-2 font-body text-base text-ink ${error ? "border-bad" : "border-border"} ${className}`}
				placeholderTextColor={colors.muted}
				{...props}
			/>
			{hint && !error && <Text variant="muted">{hint}</Text>}
			{error && (
				<Text
					className="text-bad"
					role="alert"
					variant="muted"
				>
					{error}
				</Text>
			)}
		</View>
	);
};
