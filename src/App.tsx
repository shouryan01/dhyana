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
import { Shell } from "@/components/Shell";
import { isISODate, todayISO } from "@/lib/dates";

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

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, dayRoute, settingsRoute]),
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
    const splash = document.getElementById("splash");
    if (!splash) return;
    splash.style.opacity = "0";
    const t = window.setTimeout(() => splash.remove(), 160);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (app.loadError) {
    return <div className="p-10 text-muted">dhyana couldn't start: {app.loadError}</div>;
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
