import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import {
	type DefaultReactSuggestionItem,
	getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import "./styles.css";

const insertDate = (editor: BlockNoteEditor) => ({
	title: "Insert Today's Date",
	onItemClick: () => {
		const currentBlock = editor.getTextCursorPosition().block;
		const currentDate = new Date().toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
		const helloWorldBlock: PartialBlock = {
			type: "paragraph",
			content: [{ type: "text", text: currentDate, styles: { bold: true } }],
		};
		editor.insertBlocks([helloWorldBlock], currentBlock, "before");
	},
	aliases: ["date", "dt", "today"],
	group: "Utility",
	subtext: "Used to insert a block with today's date.",
});

export const getCustomSlashMenuItems = (
	editor: BlockNoteEditor,
): DefaultReactSuggestionItem[] => [
	insertDate(editor),
	...getDefaultReactSlashMenuItems(editor),
];
