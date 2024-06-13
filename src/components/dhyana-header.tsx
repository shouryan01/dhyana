"use client";

import { Button } from "./ui/button";
import { Link } from "next-view-transitions";
import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { motion } from "framer-motion";

export default function DhyanaHeader() {
	return (
		<header className="flex flex-col items-center p-24">
			<Link href="/about">
				<Button variant="ghost" className="fixed top-10 left-10 about">
					about
				</Button>
			</Link>
			<span className="text-3xl font-serif dhyana">dhyāna</span>
			<motion.div variants={STAGGER_CHILD_VARIANTS}>
				<span className="text-md font-serif">
					meditation and self-reflection AI journal
				</span>
			</motion.div>
		</header>
	);
}
