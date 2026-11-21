import { createFileRoute } from "@tanstack/react-router";

function failedLogin(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: "/login?error=discord_down", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { finishLogin } = await import("@/lib/nexora/service.server");
          return await finishLogin(request);
        } catch (error) {
          console.error("[nexora] login callback failed", error instanceof Error ? error.message : "callback");
          return failedLogin();
        }
      },
    },
  },
});