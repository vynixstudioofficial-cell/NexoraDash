import { createFileRoute } from "@tanstack/react-router";

function failedLogin(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: "/login?error=discord_down", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/auth/discord/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { beginLogin } = await import("@/lib/nexora/service.server");
          return await beginLogin(request);
        } catch (error) {
          console.error("[nexora] login start failed", error instanceof Error ? error.message : "login");
          return failedLogin();
        }
      },
    },
  },
});