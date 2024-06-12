import type { Block, PartialBlock } from "@blocknote/core";

export async function saveToStorage(jsonBlocks: Block[]) {
	localStorage.setItem("editorContent", JSON.stringify(jsonBlocks));
}

export async function loadFromStorage() {
	const storageString = localStorage.getItem("editorContent");
	return storageString
		? (JSON.parse(storageString) as PartialBlock[])
		: undefined;
}
