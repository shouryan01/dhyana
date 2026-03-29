export function setupMockAIFetch() {
  if (typeof window === 'undefined') return;
  
  // Prevent multiple wrapping if HMR triggers
  if ((window as any).__mockAIFetchSetup) return;
  (window as any).__mockAIFetchSetup = true;

  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    
    if (url.includes('/api/chat')) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const aiResponse = "This is a simulated AI response streaming directly from the frontend mock! \n\nNo actual LLM backend was called, but both Plate and BlockNote are parsing the standard Vercel AI SDK stream format correctly.";
          
          // Yield small chunks with delay
          for (let i = 0; i < aiResponse.length; i += 3) {
            const token = aiResponse.substring(i, i + 3);
            // standard Vercel AI text stream format: 0:"token"
            // We must escape quotes and newlines in the JSON string
            const escapedToken = JSON.stringify(token);
            const chunk = `0:${escapedToken}\n`;
            controller.enqueue(encoder.encode(chunk));
            await new Promise((r) => setTimeout(r, 20)); 
          }
          controller.close();
        }
      });
      return new Response(stream, {
        headers: { 
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Vercel-AI-Data-Stream': 'v1'
        }
      });
    }

    return originalFetch(input, init);
  };
}
