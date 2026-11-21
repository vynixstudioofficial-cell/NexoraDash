import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request, splat: string) {
  const { dispatchApi } = await import("@/lib/nexora/api.server");
  return dispatchApi(request, splat);
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params._splat ?? ""),
      POST: ({ request, params }) => handle(request, params._splat ?? ""),
      PUT: ({ request, params }) => handle(request, params._splat ?? ""),
    },
  },
});
