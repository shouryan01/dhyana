/**
 * What every markdown editor in the app shares: the extension set (placeholder, tag highlight,
 * the `@ ! # $` triggers) and what clicking a `[[link]]` does.
 */
import { useNavigate } from "@tanstack/react-router";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useApp, type AppContextValue } from "@/app/context";
import { TagHighlight } from "@/editor/tagHighlight";
import { Triggers } from "@/editor/triggers";
import { baseTarget, resolveTarget } from "@/lib/entityDirectory";
import { createExtensions } from "@/markdown/extensions";

/** `app` is a ref, so callbacks captured by the editor never go stale. */
export function editorExtensions(app: { current: AppContextValue }, placeholder: string) {
  return createExtensions([
    Placeholder.configure({ placeholder }),
    TagHighlight,
    Triggers.configure({
      getData: () => ({
        entities: app.current.entities,
        tags: app.current.tags,
        today: app.current.today,
      }),
      createEntity: (kind, name) => app.current.createEntity(kind, name),
    }),
  ]);
}

/**
 * Clicking a link chip opens its page; a date chip opens that day. A link to nothing yet creates
 * a plain note of that name (like Obsidian) and opens it.
 */
export function useOpenWikilink(): (el: HTMLElement) => void {
  const app = useApp();
  const navigate = useNavigate();
  const appRef = useRef(app);
  appRef.current = app;
  return useCallback(
    (el) => {
      const target = el.dataset.target ?? "";
      const hit = resolveTarget(target);
      if (hit?.kind === "date") {
        void navigate({ to: "/day/$date", params: { date: baseTarget(target) } });
      } else if (hit?.path) {
        void navigate({ to: "/entity", search: { path: hit.path } });
      } else {
        appRef.current
          .createEntity("note", baseTarget(target))
          .then((made) => navigate({ to: "/entity", search: { path: made.path } }))
          .catch((e) => toast.error(String(e instanceof Error ? e.message : e)));
      }
    },
    [navigate],
  );
}
