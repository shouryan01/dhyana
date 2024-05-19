"use client";

import { Button } from "./ui/button";
import { FileDown } from "lucide-react";
import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { Textarea } from "./ui/textarea";
import { motion } from "framer-motion";
import { useState } from "react";

export default function Chat() {
	const [text, setText] = useState("");

	const handleExport = () => {
		const textBlob = new Blob([text], { type: "text/plain" });
		const url = URL.createObjectURL(textBlob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "dhyana-journal-export.txt";
		link.click();
	};

	return (
		<motion.h1 variants={STAGGER_CHILD_VARIANTS}>
			<div className="flex flex-col item-center mb-24 w-full">
				<Textarea
					className="bg-stone-200 rounded-md shadow-md outline-none"
					onChange={(e) => setText(e.target.value)}
					placeholder="just start typing..."
				/>
				<Button
					variant="link"
					onClick={handleExport}
					className="text-stone-400"
				>
					<FileDown className="mr-2 h-4 w-4" /> Export
				</Button>
			</div>
		</motion.h1>
	);
}
