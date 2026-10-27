import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Button } from "./button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from "./dialog";
import { Input } from "./input";

type Props = {
	trigger: string;
	title: string;
	description: string;
	action: string;
	onConfirm: () => void;
	/** For what can't be undone: the action waits until this is typed, say the household's name. */
	typed?: { label: string; text: string } | undefined;
	disabled?: boolean | undefined;
};

/** A confirmed action: its button opens a dialog that says what happens before anything does. */
export const Confirm = ({
	trigger,
	title,
	description,
	action,
	onConfirm,
	typed,
	disabled = false,
}: Props) => {
	const { t } = useLingui();
	const [entered, setEntered] = useState("");
	const ready = typed === undefined || entered.trim() === typed.text;
	return (
		<Dialog onOpenChange={() => setEntered("")}>
			<DialogTrigger asChild>
				<Button
					disabled={disabled}
					variant="secondary"
				>
					{trigger}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
				{typed && (
					<Input
						autoCapitalize="none"
						label={typed.label}
						onChangeText={setEntered}
						value={entered}
					/>
				)}
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="secondary">{t`Cancel`}</Button>
					</DialogClose>
					<DialogClose asChild>
						<Button
							disabled={!ready}
							onPress={onConfirm}
						>
							{action}
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
