import {
	Baby,
	Bus,
	Car,
	CircleDollarSign,
	Coffee,
	Gift,
	GraduationCap,
	HeartPulse,
	House,
	type LucideIcon,
	type LucideProps,
	Plane,
	Shirt,
	ShoppingCart,
	Smartphone,
	Tag,
	Utensils,
	Wallet,
	Wrench,
	Zap,
} from "lucide-react-native";

import { useColors } from "@/theme/theme";

/** Lucide at the global stroke width of 2.5 (ADR-0008), coloured ink unless told otherwise. */
export const Icon = ({
	as: LucideComponent,
	color,
	strokeWidth = 2.5,
	size = 24,
	...props
}: LucideProps & { as: LucideIcon }) => {
	const colors = useColors();
	return (
		<LucideComponent
			color={color ?? colors.ink}
			size={size}
			strokeWidth={strokeWidth}
			{...props}
		/>
	);
};

/**
 * Category icons by stable Hisaab key (ADR-0008). The database stores the key, never a Lucide name, so a library
 * rename can't break stored data. Add keys; never rename or remove one.
 */
export const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
	groceries: ShoppingCart,
	dining: Utensils,
	coffee: Coffee,
	transport: Bus,
	car: Car,
	travel: Plane,
	home: House,
	utilities: Zap,
	phone: Smartphone,
	health: HeartPulse,
	education: GraduationCap,
	clothing: Shirt,
	children: Baby,
	gifts: Gift,
	repairs: Wrench,
	salary: Wallet,
	income: CircleDollarSign,
};

export const DEFAULT_CATEGORY_ICON: LucideIcon = Tag;

/** The icon for a stored key; unknown keys (say, from a newer build) fall back to the default. */
export const categoryIcon = (key: string): LucideIcon =>
	CATEGORY_ICONS[key] ?? DEFAULT_CATEGORY_ICON;
