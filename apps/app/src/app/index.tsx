import { Link } from "expo-router";
import { Button, StyleSheet, View } from "react-native";

import { HouseholdList } from "@/features/households/household-list";
import { useHouseholds } from "@/features/households/use-households";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const Households = ({ userId }: { userId: string }) => (
	<HouseholdList households={useHouseholds(userId)} />
);

export default function Home() {
	const session = useSession();

	return (
		<View style={styles.screen}>
			{session && <Households userId={session.user.id} />}
			<Link
				asChild
				href="/sync-status"
			>
				<Button title="Sync status" />
			</Link>
			<Button
				onPress={() => void supabase.auth.signOut()}
				title="Sign out"
			/>
		</View>
	);
}

const styles = StyleSheet.create({ screen: { gap: 16, padding: 24 } });
