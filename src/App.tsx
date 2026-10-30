import {
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useParams,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppProvider, useApp } from "@/app/context";
import { DayView } from "@/components/DayView";
import { Onboarding } from "@/components/Onboarding";
import { SettingsPage } from "@/components/SettingsPage";
import { ShortcutsPage } from "@/components/ShortcutsPage";
import { Shell } from "@/components/Shell";
import { isISODate, todayISO } from "@/lib/dates";
import { getDevSettings } from "@/lib/devSettings";
import { hideSplash } from "@/lib/splash";

const SPLASH_HOLD_MS = 2000;

const rootRoute = createRootRoute({ component: Gate });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/day/$date", params: { date: todayISO() }, replace: true });
  },
});

const dayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/day/$date",
  beforeLoad: ({ params }) => {
    if (!isISODate(params.date)) {
      throw redirect({ to: "/day/$date", params: { date: todayISO() }, replace: true });
    }
  },
  component: DayRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const shortcutsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shortcuts",
  component: ShortcutsPage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, dayRoute, settingsRoute, shortcutsRoute]),
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function DayRoute() {
  const { date } = useParams({ from: "/day/$date" });
  return <DayView date={date} />;
}

/** Splash until the core is ready; onboarding on first launch (or replay); otherwise the app. */
function Gate() {
  const app = useApp();
  const ready = app.app !== null || app.loadError !== null;

  useEffect(() => {
    if (!ready) return;
    const hold = getDevSettings().holdSplash ? SPLASH_HOLD_MS : 0;
    const t = window.setTimeout(hideSplash, hold);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (app.loadError) {
    return <div className="p-10 text-muted">dhyāna couldn't start: {app.loadError}</div>;
  }
  if (!app.app) return null;

  const firstRun = !app.app.onboardingCompleted || !app.app.vaultPath;
  if (firstRun) return <Onboarding />; // no vault yet: nothing else can load
  return (
    <>
      <Shell />
      {app.replaying && <Onboarding />}
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
