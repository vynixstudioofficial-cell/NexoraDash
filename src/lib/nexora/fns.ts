import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SESSION_COOKIE } from "./pure";

async function context() {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  const { getCookie, getRequest } = await import("@tanstack/react-start/server");
  assertSameSiteRequest();
  return {
    token: getCookie(SESSION_COOKIE) ?? null,
    request: getRequest() ?? null,
  };
}

export const getIntegrationStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { request } = await context();
  const { loadIntegration } = await import("./service.server");
  return loadIntegration(request);
});

export const getPublicBot = createServerFn({ method: "GET" }).handler(async () => {
  await context();
  const { loadBotCard } = await import("./service.server");
  return loadBotCard();
});



export const getSessionView = createServerFn({ method: "GET" }).handler(async () => {
  const { token } = await context();
  const { loadSessionView } = await import("./service.server");
  return loadSessionView(token);
});

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { token, request } = await context();
  const { loadOverview } = await import("./service.server");
  return loadOverview(token, request);
});

export const getGuildList = createServerFn({ method: "GET" }).handler(async () => {
  const { token } = await context();
  const { loadGuildList } = await import("./service.server");
  return loadGuildList(token);
});

export const getGuildDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ guildId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { token } = await context();
    const { loadGuildDetail } = await import("./service.server");
    return loadGuildDetail(token, data.guildId);
  });

export const saveSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        guildId: z.string(),
        csrf: z.string(),
        theme: z.string(),
        welcomeEnabled: z.boolean(),
        welcomeChannelId: z.string(),
        welcomeMessage: z.string(),
        leaveEnabled: z.boolean(),
        leaveChannelId: z.string(),
        leaveMessage: z.string(),
        joinRoleId: z.string(),
        automod: z.boolean(),
        linkFilter: z.boolean(),
        bannedWords: z.string(),
        levelChannelId: z.string(),
        ticketPanelStyle: z.string(),
        ticketCategoryId: z.string(),
        verificationEnabled: z.boolean(),
        verificationChannelId: z.string(),
        verifiedRoleId: z.string(),
        unverifiedRoleId: z.string(),
        verificationMethod: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { token } = await context();
    const { saveGuildSettings } = await import("./service.server");
    const { guildId, ...rest } = data;
    return saveGuildSettings(token, guildId, rest);
  });

export const resetSettings = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ guildId: z.string(), csrf: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { token } = await context();
    const { resetGuildSettings } = await import("./service.server");
    return resetGuildSettings(token, data.guildId, data.csrf);
  });

export const getBotForms = createServerFn({ method: "GET" }).handler(async () => {
  const { token } = await context();
  const { loadBotForms } = await import("./service.server");
  return loadBotForms(token);
});

export const getApplications = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ guildId: z.string().nullable().optional(), status: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { token } = await context();
    const { listApplications } = await import("./service.server");
    return listApplications(token, data.guildId ?? null, data.status ?? null);
  });

export const reviewApplication = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        id: z.string(),
        csrf: z.string(),
        status: z.enum(["approved", "rejected"]),
        note: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { token } = await context();
    const { reviewApplication: review } = await import("./service.server");
    return review(token, data.id, data);
  });

export const getLogs = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        page: z.number().optional(),
        level: z.string().optional(),
        kind: z.string().optional(),
        q: z.string().optional(),
        guildId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { token } = await context();
    const { loadLogs } = await import("./service.server");
    return loadLogs(token, data);
  });

export const getOwnerConsole = createServerFn({ method: "GET" }).handler(async () => {
  const { token, request } = await context();
  const { loadOwner } = await import("./service.server");
  return loadOwner(token, request);
});

export const signOut = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ csrf: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { token, request } = await context();
    const { destroySession, requestIsSecure } = await import("./service.server");
    const { setCookie } = await import("@tanstack/react-start/server");
    await destroySession(token, data.csrf);
    setCookie(SESSION_COOKIE, "", {
      path: "/",
      httpOnly: true,
      secure: request ? requestIsSecure(request) : true,
      sameSite: "lax",
      maxAge: 0,
    });
    return { ok: true as const };
  });
