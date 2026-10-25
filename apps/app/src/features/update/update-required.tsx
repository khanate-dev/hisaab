import { Button, StyleSheet, Text, View } from "react-native";

type Props = {
	/** Loads the newer build when the app can do that itself (a reload on web). */
	onUpdate?: (() => void) | undefined;
};

/** The hard block for a build below the server's minimum contract version (ADR-0009). There is no read-only mode. */
export const UpdateRequired = ({ onUpdate }: Props) => (
	<View style={styles.screen}>
		<Text
			role="heading"
			style={styles.title}
		>
			Update required
		</Text>
		<Text>
			This version of Hisaab is too old to sync. Your changes are safe on this
			device and will sync after you update.
		</Text>
		{onUpdate ? (
			<Button
				onPress={onUpdate}
				title="Update now"
			/>
		) : (
			<Text>Update Hisaab from your app store, then open it again.</Text>
		)}
	</View>
);

const styles = StyleSheet.create({
	screen: { flex: 1, gap: 16, justifyContent: "center", padding: 24 },
	title: { fontSize: 24, fontWeight: "bold" },
});
