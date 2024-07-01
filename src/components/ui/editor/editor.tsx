"use client";

import { useEffect, useMemo, useState } from "react";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import {
	BlockNoteEditor,
	type PartialBlock,
	filterSuggestionItems,
} from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController } from "@blocknote/react";

import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { motion } from "framer-motion";
import { FileDown } from "lucide-react";

import { Button as ExportButton } from "../button";
import { loadFromStorage, saveToStorage } from "./storage";
import { getCustomSlashMenuItems } from "./suggestion-menu";
import { getEmotionMenuItems } from "./tag";
import { dhyanaTheme, schema } from "./theme-schema";

export default function Editor() {
	const [initialContent, setInitialContent] = useState<
		PartialBlock[] | undefined | "loading"
	>("loading");
	const [markdown, setMarkdown] = useState<string>("");

	useEffect(() => {
		loadFromStorage().then((content) => {
			setInitialContent(content);
		});
	}, []);

	const editor = useMemo(() => {
		if (initialContent === "loading") {
			return undefined;
		}
		return BlockNoteEditor.create({ initialContent, schema: schema });
	}, [initialContent]);

	if (editor === undefined) {
		return (
			<div className="flex justify-center items-center h-screen w-full">
				Loading content...
			</div>
		);
	}

	const handleChange = async () => {
		const markdown = await editor.blocksToMarkdownLossy(editor.document);
		setMarkdown(markdown);
		//@ts-ignore
		saveToStorage(editor.document);
	};

	const handleExport = () => {
		const mdBlob = new Blob([markdown], { type: "text/markdown" });
		const url = URL.createObjectURL(mdBlob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "dhyana-journal-export.md";
		link.click();
	};

	return (
		<motion.h1 variants={STAGGER_CHILD_VARIANTS}>
			<div className="flex flex-col item-center mb-24 w-full max-w-7xl mx-auto">
				<BlockNoteView
					editor={editor}
					onChange={handleChange}
					theme={dhyanaTheme}
					slashMenu={false}
				>
					<SuggestionMenuController
						triggerCharacter={"/"}
						getItems={async (query) =>
							//@ts-ignore
							filterSuggestionItems(getCustomSlashMenuItems(editor), query)
						}
					/>
					<SuggestionMenuController
						triggerCharacter={"#"}
						getItems={async (query) =>
							filterSuggestionItems(getEmotionMenuItems(editor), query)
						}
					/>
				</BlockNoteView>

				<ExportButton
					variant="ghost"
					onClick={handleExport}
					className="text-stone-400 fixed bottom-0 left-0"
				>
					<FileDown className="mr-1 h-4 w-4" /> Export
				</ExportButton>
			</div>
		</motion.h1>
	);
}
