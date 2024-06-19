"use client";

import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { motion } from "framer-motion";
import { Link } from "next-view-transitions";
import { Button } from "./ui/button";

export default function DhyanaHeader() {
	return (
		<header className="flex flex-col items-center p-24 text-stone-400">
			<Link href="/about">
				<Button variant="ghost" className="fixed top-7 right-7 about">
					about
				</Button>
			</Link>
			<div className="fixed top-7 left-7">
				<div className="text-3xl font-serif dhyana text-stone-500">dhyāna</div>
				<div className="text-md font-serif text-xs">
					meditation and self-reflection AI journal
				</div>
			</div>
		</header>
	);
}
