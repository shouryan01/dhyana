"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

import * as Button from "@/components/ui/button";
import * as Input from "@/components/ui/input";
import * as Select from "@/components/ui/select";

import {
	BlockNoteEditor,
	type Block,
	type PartialBlock,
} from "@blocknote/core";
import { useEffect, useMemo, useState } from "react";

import { BlockNoteView } from "@blocknote/shadcn";
import { Button as ExportButton } from "./ui/button";
import { FileDown } from "lucide-react";
import { ResetFormatting } from "./ResetFormatting";
import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { motion } from "framer-motion";
import { useCreateBlockNote } from "@blocknote/react";

async function saveToStorage(jsonBlocks: Block[]) {
	localStorage.setItem("editorContent", JSON.stringify(jsonBlocks));
}

async function loadFromStorage() {
	const storageString = localStorage.getItem("editorContent");
	return storageString
		? (JSON.parse(storageString) as PartialBlock[])
		: undefined;
}

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
		return BlockNoteEditor.create({ initialContent });
	}, [initialContent]);

	if (editor === undefined) {
		return "Loading content...";
	}

	const onChange = async () => {
		const markdown = await editor.blocksToMarkdownLossy(editor.document);
		setMarkdown(markdown);
	};

	const handleChange = async () => {
		onChange();
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
			<div className="flex flex-col item-center mb-24 w-full">
				<BlockNoteView
					editor={editor}
					shadCNComponents={{
						Select,
						Button,
						Input,
					}}
					className="w-96 bg-slate-300"
					onChange={handleChange}
				/>
				<ExportButton
					variant="link"
					onClick={handleExport}
					className="text-stone-400"
				>
					<FileDown className="mr-2 h-4 w-4" /> Export
				</ExportButton>
			</div>
		</motion.h1>
	);
}
