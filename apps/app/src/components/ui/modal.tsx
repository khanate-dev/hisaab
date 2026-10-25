import * as DialogPrimitive from "@rn-primitives/dialog";
import type { ReactNode } from "react";

import { ThemeScope, useColorSchemeName } from "@/theme/theme";
import { hardShadow } from "@/theme/tokens";

import { TEXT_VARIANTS } from "./text";

// The shell Dialog and Sheet share: a portalled, themed overlay holding one bordered surface with a hard shadow.

type ModalSurfaceProps = {
	children: ReactNode;
	/** Where the surface sits on the dimmed page. */
	overlayClassName: string;
	surfaceClassName: string;
};

export const ModalSurface = ({
	children,
	overlayClassName,
	surfaceClassName,
}: ModalSurfaceProps) => {
	const scheme = useColorSchemeName();
	return (
		<DialogPrimitive.Portal>
			<ThemeScope className="absolute inset-0">
				<DialogPrimitive.Overlay
					className={`absolute inset-0 bg-black/50 ${overlayClassName}`}
				>
					<DialogPrimitive.Content
						className={`gap-4 border-3 border-border bg-surface p-5 ${surfaceClassName}`}
						style={{ boxShadow: hardShadow(scheme, "card") }}
					>
						{children}
					</DialogPrimitive.Content>
				</DialogPrimitive.Overlay>
			</ThemeScope>
		</DialogPrimitive.Portal>
	);
};

/** The modal's accessible name. The primitive's Title is styled directly; `asChild` would nest two headings. */
export const ModalTitle = ({ children }: { children: ReactNode }) => (
	<DialogPrimitive.Title
		className={TEXT_VARIANTS.title}
		role="heading"
	>
		{children}
	</DialogPrimitive.Title>
);
