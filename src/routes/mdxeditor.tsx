import { createFileRoute } from "@tanstack/react-router";
import {
	MDXEditor,
	toolbarPlugin,
	listsPlugin,
	quotePlugin,
	headingsPlugin,
	linkPlugin,
	linkDialogPlugin,
	imagePlugin,
	tablePlugin,
	thematicBreakPlugin,
	frontmatterPlugin,
	codeBlockPlugin,
	markdownShortcutPlugin,
	UndoRedo,
	BoldItalicUnderlineToggles,
	BlockTypeSelect,
	CreateLink,
	InsertImage,
	InsertTable,
	InsertThematicBreak,
	ListsToggle,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

export const Route = createFileRoute("/mdxeditor")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="p-8 max-w-4xl mx-auto flex flex-col gap-6 w-full">
			<h1 className="text-3xl font-bold tracking-tight text-neutral-900">
				MDXEditor Demo
			</h1>
			<p className="text-neutral-500">
				This editor strictly enforces a markdown AST. It's excellent for pure
				markdown files. Note that custom complex AI features require custom
				Lexical nodes.
			</p>

			<div className="border border-neutral-200 rounded-xl overflow-hidden shadow-sm bg-white min-h-[500px]">
				<MDXEditor
					markdown={`# Hello World\n\nThis is a test of MDXEditor.\n\n- It supports lists\n- **Bold** text\n- And much more!\n\n> "It strictly maps everything to a Markdown AST out of the box."`}
					plugins={[
						toolbarPlugin({
							toolbarContents: () => (
								<div className="flex items-center gap-1 overflow-x-auto">
									<UndoRedo />
									<BoldItalicUnderlineToggles />
									<ListsToggle />
									<BlockTypeSelect />
									<CreateLink />
									<InsertImage />
									<InsertTable />
									<InsertThematicBreak />
								</div>
							),
						}),
						listsPlugin(),
						quotePlugin(),
						headingsPlugin(),
						linkPlugin(),
						linkDialogPlugin(),
						imagePlugin(),
						tablePlugin(),
						thematicBreakPlugin(),
						frontmatterPlugin(),
						codeBlockPlugin({ defaultCodeBlockLanguage: "js" }),
						markdownShortcutPlugin(),
					]}
					contentEditableClassName="prose max-w-none p-4 min-h-[400px] focus:outline-none"
				/>
			</div>
		</div>
	);
}
