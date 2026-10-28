import { useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

import { SUPPORT_EMAIL } from "./contact";

const Section = ({ title, body }: { title: string; body: string[] }) => (
	<View className="gap-2">
		<Text variant="title">{title}</Text>
		{body.map((paragraph) => (
			<Text key={paragraph}>{paragraph}</Text>
		))}
	</View>
);

/** The privacy policy the stores link to (spec §8): what Hisaab keeps, who sees it, and for how long. */
export const PrivacyPolicy = () => {
	const { t } = useLingui();
	return (
		<>
			<Text variant="muted">{t`Last updated 28 October 2026`}</Text>
			<Section
				body={[
					t`Your email address, to sign you in with a one-time code, and the name you choose.`,
					t`What you and your household record: Wallets, Entries, Budgets, Loans, Contacts, Recurring rules, notes and the Attachments you add.`,
					t`Your settings and saved filters, the Activity log of changes in each household, and the push addresses of the devices you turn notifications on for.`,
				]}
				title={t`What Hisaab keeps`}
			/>
			<Section
				body={[
					t`A household's data is seen only by its members, as far as their Role allows.`,
					t`Hisaab has no ads and no tracking, and never sells or shares your data for marketing.`,
				]}
				title={t`Who sees it`}
			/>
			<Section
				body={[
					t`Supabase stores the data, the files and your sign-in. PowerSync syncs it to your devices, which keep a copy for offline use.`,
					t`Cloudflare serves this website and holds the off-site backups. Resend sends the sign-in emails. Expo, Google, Apple and your browser's push service deliver push notifications.`,
					t`Exchange rates are fetched without any of your data.`,
				]}
				title={t`Who helps run it`}
			/>
			<Section
				body={[
					t`Backups of the database and the files are kept for at most 30 days, then deleted.`,
					t`The files of deleted Entries are removed after 90 days, Notifications after 90 days, and the record of push deliveries after 30 days.`,
				]}
				title={t`Backups and how long data is kept`}
			/>
			<Section
				body={[
					t`You can delete your account in the app, under Me & household. It takes effect at once: your Personal household, any household only you are in, and their files are deleted, and your pending Invites are revoked. In shared households what you recorded stays, under an anonymous Former member.`,
					t`If you're the only Admin of a household with other people in it, make someone else an Admin (or delete the household) first.`,
					t`Backups made before then expire within 30 days. If one is ever restored, your deletion is applied again.`,
					t`An Admin can make a Full backup of a household, or export it as a spreadsheet, at any time.`,
				]}
				title={t`Deleting and exporting your data`}
			/>
			<Section
				body={[t`Questions or requests about your data: ${SUPPORT_EMAIL}.`]}
				title={t`Contact`}
			/>
		</>
	);
};
