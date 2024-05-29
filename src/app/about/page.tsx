"use client";

import { Button } from "@/components/ui/button";
import FadeInWrapper from "@/components/fade-in-wrapper";
import { Link } from "next-view-transitions";
import { STAGGER_CHILD_VARIANTS } from "@/lib/utils";
import { motion } from "framer-motion";

export default function About() {
	return (
		<FadeInWrapper>
			<main className="flex flex-col justify-center items-center bg-stone-200 text-stone-600 font-serif h-screen overflow-hidden">
				<Link href="/">
					<Button variant="ghost" className="fixed top-10 left-10">
						back
					</Button>
				</Link>

				<div className="flex flex-col max-w-3xl">
					<span className="text-3xl font-serif dhyana">about</span>
					<motion.div variants={STAGGER_CHILD_VARIANTS}>
						<div className="text-md font-serif m-10">why build dhyāna?</div>
						<ul className="list-none">
							<li>many great journaling apps already exist.</li>
							<li>pen and paper exists.</li>
						</ul>

						<div className="text-md font-serif m-10">vision:</div>
						<ul>
							<li>
								help beginners put feelings into writing (i struggle with this)
							</li>
							<li>
								help with self-reflection: automatically surface relevant old
								memories
							</li>
							<li>be a "pseudo-therapist"</li>
							<li>advanced AI and search features</li>
						</ul>

						<div className="text-md font-serif m-10">lastly!</div>
						<ul className="list-none">
							<li>dhyāna will always have a free option</li>
							<li>dhyāna will always have a 100% local, offline option</li>
						</ul>
					</motion.div>
				</div>
			</main>
		</FadeInWrapper>
	);
}
