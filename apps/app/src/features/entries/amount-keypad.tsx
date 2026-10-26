import { type AmountKey, DELETE_KEY } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Delete } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { usePressIn } from "@/components/ui/pressable-surface";
import { Text } from "@/components/ui/text";

const ROWS: readonly (readonly AmountKey[])[] = [
	["1", "2", "3"],
	["4", "5", "6"],
	["7", "8", "9"],
	[".", "0", DELETE_KEY],
];

const Key = ({ value, onPress }: { value: AmountKey; onPress: () => void }) => {
	const { t } = useLingui();
	const pressIn = usePressIn("control", {});
	const label =
		value === DELETE_KEY
			? t`Delete last digit`
			: value === "."
				? t`Decimal point`
				: value;
	return (
		<Pressable
			accessibilityLabel={label}
			className="min-h-11 flex-1 items-center justify-center rounded-control border-3 border-border bg-surface"
			onPress={onPress}
			role="button"
			{...pressIn}
		>
			{value === DELETE_KEY ? (
				<Icon as={Delete} />
			) : (
				<Text
					className="text-xl"
					variant="figure"
				>
					{value}
				</Text>
			)}
		</Pressable>
	);
};

/** The in-app amount keypad (spec §4.2), so the phone keyboard never covers the sheet. */
export const AmountKeypad = ({
	onKey,
}: {
	onKey: (key: AmountKey) => void;
}) => (
	<View className="gap-2">
		{ROWS.map((row) => (
			<View
				className="flex-row gap-2"
				key={row.join("")}
			>
				{row.map((value) => (
					<Key
						key={value}
						onPress={() => onKey(value)}
						value={value}
					/>
				))}
			</View>
		))}
	</View>
);
