import { createFileRoute } from '@tanstack/react-router'
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "@blocknote/xl-ai/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { AIExtension } from "@blocknote/xl-ai";
import { setupMockAIFetch } from '../lib/mock-ai';

// Initialize the mock fetch when this module loads
setupMockAIFetch();

export const Route = createFileRoute('/blocknote')({
  component: RouteComponent,
})

function RouteComponent() {
  const editor = useCreateBlockNote({
    extensions: [
      AIExtension(),
    ],
  });

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-6 w-full">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-900">BlockNote AI Demo</h1>
      <p className="text-neutral-500">
        This uses BlockNote's official AI extension. Select text to see the AI formatting toolbar, or use slash commands (e.g. <code className="bg-neutral-100 px-2 py-0.5 rounded">/ai</code>) to trigger generation. All AI requests are mocked locally via our mock-ai stream!
      </p>
      
      <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-sm bg-white min-h-[500px] p-4">
        {/* BlockNoteView comes with default toolbars. We'll leave them to test default XL-AI integration */}
        <BlockNoteView editor={editor} theme="light" />
      </div>
    </div>
  )
}
