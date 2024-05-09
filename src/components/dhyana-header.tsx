"use client";

import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { motion } from "framer-motion";

export default function DhyanaHeader() {
	return (
		<header className="flex flex-col items-center p-24">
			<motion.div variants={STAGGER_CHILD_VARIANTS}>
				<span className="text-3xl font-serif">dhyāna</span>
			</motion.div>
			<motion.div variants={STAGGER_CHILD_VARIANTS}>
				<span className="text-md font-serif">
					meditation and self-reflection AI journal
				</span>
			</motion.div>
		</header>
	);
}
