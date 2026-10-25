import { useLingui } from "@lingui/react/macro";
import { Link, usePathname } from "expo-router";
import { Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

import { HouseholdPill } from "./household-switcher";
import { useQuickAdd } from "./quick-add";
import { SECTIONS } from "./sections";

/** Wide web (from 1024px): the household pill, then + New entry, then every section (Navigation ticket, #17). */
export const Sidebar = () => {
	const { t, i18n } = useLingui();
	const quickAdd = useQuickAdd();
	const pathname = usePathname();

	return (
		<View
			accessibilityLabel={t`Sections`}
			className="w-64 gap-4 border-e-3 border-border bg-surface p-4"
			role="navigation"
		>
			<HouseholdPill />
			<Button onPress={quickAdd.open}>
				<Icon
					as={Plus}
					size={20}
				/>
				<Text variant="label">{t`New entry`}</Text>
			</Button>
			<View className="gap-1">
				{SECTIONS.map((section) => {
					const current = pathname === section.href;
					const title = i18n._(section.title);
					return (
						<Link
							asChild
							href={section.href}
							key={section.route}
						>
							<Pressable
								accessibilityLabel={title}
								accessibilityState={{ selected: current }}
								className={`flex-row items-center gap-3 rounded-control ps-3 pe-3 py-2 ${current ? "bg-butter" : ""}`}
								role="link"
							>
								<Icon as={section.icon} />
								<Text variant="label">{title}</Text>
							</Pressable>
						</Link>
					);
				})}
			</View>
		</View>
	);
};
