"use client";

import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { motion } from "framer-motion";
import { Link } from "next-view-transitions";
import { Button } from "../ui/button";

export default function DhyanaHeader({
	className,
	asLogo,
}: { className?: string; asLogo?: boolean }) {
	let innerDivStyle = "";

	if (asLogo) {
		innerDivStyle = "fixed top-7 left-7";
	} else {
		innerDivStyle = "flex flex-col items-center";
	}

	return (
		<header className="p-24 text-stone-400 font-serif">
			<div className={innerDivStyle}>
				<motion.div
					variants={STAGGER_CHILD_VARIANTS}
					className="text-5xl font-serif text-stone-500 mb-1 about dhyana"
				>
					dhyāna
				</motion.div>
				<motion.div variants={STAGGER_CHILD_VARIANTS} className="text-sm">
					the meditation & self-reflection AI journal
				</motion.div>
			</div>
		</header>
	);
}
