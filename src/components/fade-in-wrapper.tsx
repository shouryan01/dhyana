"use client";

import { motion } from "framer-motion";

export default function FadeInWrapper({
	children,
}: { children: React.ReactNode }) {
	return (
		<motion.div
			exit={{ opacity: 0, scale: 0.95 }}
			transition={{ duration: 0.3, type: "spring" }}
		>
			<motion.div
				variants={{
					show: {
						transition: {
							staggerChildren: 0.2,
						},
					},
				}}
				initial="hidden"
				animate="show"
			>
				{children}
			</motion.div>
		</motion.div>
	);
}
