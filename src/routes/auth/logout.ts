import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { dispatchLogout } = await import("@/lib/nexora/api.server");
        return dispatchLogout(request);
      },
    },
  },
});
