import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useActions } from "@/app/actions";
import { Kbd } from "@/components/ui/kbd";

/** Every action and its shortcut, generated from the registry. Linked from Settings and bound to "?". */
export function ShortcutsPage() {
  const actions = useActions();
  return (
    <div className="h-full overflow-y-auto bg-chrome">
      <div className="anim-fade mx-auto max-w-[620px] px-8 pb-24 pt-14">
        <Link to="/settings" className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted transition-colors duration-100 hover:text-fg">
          <ArrowLeft size={13} />
          Settings
        </Link>
        <h1 className="mb-8 text-[22px] font-semibold tracking-tight">Keyboard shortcuts</h1>

        {actions.map((a) => (
          <div key={a.id} className="flex min-h-10 items-center justify-between gap-4 py-1.5">
            <span className="text-[13px]">{a.label}</span>
            <span className="flex items-center gap-2">
              {a.shortcut ? <Kbd shortcut={a.shortcut} /> : <span className="text-[12px] text-muted">palette only</span>}
              {a.also?.map((s) => (
                <span key={s} className="flex items-center gap-2 text-muted">
                  or <Kbd shortcut={s} />
                </span>
              ))}
            </span>
          </div>
        ))}
        <p className="px-1 pt-3 text-[12px] text-muted">
          Single-key shortcuts (like G T) work outside the editor. Press Esc to leave the editor.
        </p>
      </div>
    </div>
  );
}
