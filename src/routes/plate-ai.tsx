import { createFileRoute } from '@tanstack/react-router'
import { Plate, PlateContent, usePlateEditor } from 'platejs/react'
import { AIPlugin, AIChatPlugin } from '@platejs/ai/react'
import { setupMockAIFetch } from '../lib/mock-ai'

// Initialize the mock fetch when this module loads
setupMockAIFetch();

export const Route = createFileRoute('/plate-ai')({
  component: RouteComponent,
})

function RouteComponent() {
  const plugins = [
    AIPlugin,
    AIChatPlugin.configure({
      options: {
        api: '/api/chat', // intercepted by our mock AI backend
      }
    })
  ] as any; // Ignore strict plate typing for simple demo

  const initialValue = [
    {
      type: 'p',
      children: [{ text: 'Headless Plate.js AI Demo.' }],
    },
    {
      type: 'p',
      children: [{ text: 'Type here and test the AI plugins programmatically, as the CLI failed to generate the UI components due to Tailwind v4 conflicts.' }],
    }
  ] as any;

  const editor = usePlateEditor({ plugins, value: initialValue }) as any;

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-6 w-full">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Plate.js AI Demo</h1>
      <p className="text-neutral-500 leading-relaxed">
        Because the <code className="bg-neutral-100 px-1 py-0.5 rounded">npx @udecode/plate-ui add editor</code> CLI command relies on an older Shadcn-UI configuration that conflicts with this project's newly introduced Tailwind v4 setup, we've instantiated Plate in a <strong>headless</strong> environment. The <code className="bg-neutral-100 px-1 py-0.5 rounded">@platejs/ai</code> plugins are successfully loaded and connected to the mock stream, but testing them visually requires manual UI reconstruction.
      </p>

      <div className="border border-neutral-300 rounded-xl overflow-hidden shadow-sm bg-white min-h-[400px] p-6 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-colors">
        <Plate editor={editor}>
          <PlateContent className="prose max-w-none focus:outline-none" placeholder="Start typing..." />
        </Plate>
      </div>
    </div>
  )
}
