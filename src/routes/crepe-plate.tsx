import { createFileRoute } from "@tanstack/react-router";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { useLayoutEffect, useRef } from "react";

export const Route = createFileRoute("/crepe-plate")({
	component: RouteComponent,
});

function MilkdownCrepeEditor() {
	const containerRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		if (!containerRef.current) return;

		const crepe = new Crepe({
			root: containerRef.current,
			defaultValue:
				"# Crepe Editor\n\nTry using slash commands here (type `/` to see options). It offers a Notion-like experience out of the box!\n\nCrepe is built on **Milkdown**, which runs on top of **Prosemirror**.",
		});

		crepe.create().catch(console.error);

		return () => {
			crepe.destroy();
		};
	}, []);

	return (
		<div className="border border-neutral-200 rounded-xl overflow-hidden shadow-sm bg-white min-h-[400px]">
			<div ref={containerRef} className="h-full w-full" />
		</div>
	);
}

function RouteComponent() {
	return (
		<div className="p-8 max-w-4xl mx-auto flex flex-col gap-12 w-full">
			<div>
				<h1 className="text-3xl font-bold tracking-tight text-neutral-900 mb-2">
					Crepe (Milkdown)
				</h1>
				<p className="text-neutral-500 mb-6">
					Zero config Notion-like editor with slash commands.
				</p>
				<MilkdownCrepeEditor />
			</div>

			<div>
				<h1 className="text-3xl font-bold tracking-tight text-neutral-900 mb-2">
					Plate.js (Base Setup)
				</h1>
				<p className="text-neutral-500 mb-6">
					Plate requires a more complex UI setup for its Notion-like features.
				</p>
				<div className="p-6 bg-neutral-100/50 rounded-xl border border-neutral-200/60 text-neutral-700 text-sm leading-relaxed">
					<p className="mb-4">
						<strong>Note:</strong> Plate is an extremely modular framework built
						on Slate.js. While highly powerful, it is typically installed using
						a CLI (
						<code className="bg-neutral-200 px-1 py-0.5 rounded">
							npx @udecode/plate-ui add editor
						</code>
						) which sets up dozens of tailwind/radix UI components directly in
						your codebase to give you a full Notion clone.
					</p>
					<p>
						Due to this architectural choice, there's no "drop-in" UI component
						for Plate. We recommend testing Plate in their online playground or
						setting it up fully via their CLI if you prefer it over Crepe.
					</p>
				</div>
			</div>
		</div>
	);
}
