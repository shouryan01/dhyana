import {
	type DragHandleMenuProps,
	useBlockNoteEditor,
	useComponentsContext,
} from "@blocknote/react";

export function ResetType(props: DragHandleMenuProps) {
	const editor = useBlockNoteEditor();

	// biome-ignore lint/style/noNonNullAssertion: ignore biome on next line
	const Components = useComponentsContext()!;

	return (
		<Components.Generic.Menu.Item
			onClick={() => {
				editor.updateBlock(props.block, { type: "paragraph" });
			}}
		>
			Reset Type
		</Components.Generic.Menu.Item>
	);
}
