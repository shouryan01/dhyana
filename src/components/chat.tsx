"use client";

import { Input } from "./ui/input";
import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { motion } from "framer-motion";

export default function Chat() {
	return (
		<motion.h1 variants={STAGGER_CHILD_VARIANTS}>
			<div className="flex flex-col item-center mb-24">
				<Input
					type="text"
					placeholder="journal your thoughts..."
					className="bg-stone-200 rounded-md shadow-md"
				/>
			</div>
		</motion.h1>
	);
}
