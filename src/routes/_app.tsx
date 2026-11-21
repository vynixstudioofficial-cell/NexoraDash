import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { Shell } from "@/components/nexora/shell";
import { getSessionView } from "@/lib/nexora/fns";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    try {
      const me = await getSessionView();
      if (!me.authenticated) throw redirect({ to: "/login" });
      return { me };
    } catch (error) {
      if (isRedirect(error)) throw error;
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { me } = Route.useRouteContext();
  return <Shell me={me} />;
}
