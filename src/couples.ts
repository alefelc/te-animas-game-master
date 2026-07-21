import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import {
  authenticateAccountToken,
  directusAdminRequest,
  DirectusRequestError,
  readAccountUser,
  type AccountUser,
} from "./directus.js";

const InviteInputSchema = z.object({
  expires_in_days: z.coerce.number().int().min(1).max(30).optional().default(7),
});
const LinkInputSchema = z.object({ code: z.string().trim().min(12).max(256) });
const PreferencesInputSchema = z.object({ preferences: z.unknown().nullable() });
const SignalInputSchema = z.object({
  response: z.enum(["interested", "maybe", "no", "repeat", "talk", "blocked", "favorite", "later"]),
});
const HistoryInputSchema = z.object({
  session_id: z.string().min(1).max(128),
  summary: z.unknown().nullable().optional().default(null),
});

interface CoupleRow {
  id: string;
  status: "active" | "closed";
  created_by: string;
  shared_preferences: unknown | null;
  date_created?: string | null;
  date_updated?: string | null;
}
interface MemberRow {
  id: string;
  couple: string;
  user: string;
  role: "owner" | "partner";
  joined_at?: string | null;
}
interface InviteRow {
  id: string;
  inviter_user: string;
  code_hash: string;
  expires_at: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  used_by: string | null;
}
interface SignalRow {
  id: string;
  couple: string;
  user: string;
  card_id: string;
  response: z.infer<typeof SignalInputSchema>["response"];
  date_updated?: string | null;
}
interface HistoryRow {
  id: string;
  couple: string;
  session_id: string;
  summary: unknown | null;
  created_by: string;
  date_created?: string | null;
}

export class CoupleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "CoupleError";
  }
}

function fields(items: string[]) {
  return items.join(",");
}

function hashInviteCode(code: string) {
  return createHmac("sha256", config.coupleInvitePepper)
    .update(code.trim())
    .digest("hex");
}

function stableRecordId(...parts: string[]) {
  const hex = createHash("sha256").update(parts.join(":"), "utf8").digest("hex");
  // UUID compatible, determinista y con bits de versión/variante válidos.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function membershipForUser(userId: string): Promise<MemberRow | null> {
  const params = new URLSearchParams({
    fields: fields(["id", "couple", "user", "role", "joined_at"]),
    limit: "1",
    "filter[user][_eq]": userId,
  });
  const rows = await directusAdminRequest<MemberRow[]>(`/items/pc_couple_members?${params}`);
  return rows[0] ?? null;
}

async function requireMembership(userId: string): Promise<MemberRow> {
  const member = await membershipForUser(userId);
  if (!member) throw new CoupleError("No hay una pareja vinculada.", 404, "COUPLE_NOT_LINKED");
  return member;
}

async function coupleById(id: string): Promise<CoupleRow> {
  return directusAdminRequest<CoupleRow>(
    `/items/pc_couples/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields(["id", "status", "created_by", "shared_preferences", "date_created", "date_updated"]))}`,
  );
}

function publicUser(user: AccountUser) {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

async function bundleForUser(userId: string) {
  const own = await membershipForUser(userId);
  if (!own) return null;
  const couple = await coupleById(own.couple);
  if (couple.status !== "active") return null;
  const params = new URLSearchParams({
    fields: fields(["id", "couple", "user", "role", "joined_at"]),
    limit: "2",
    "filter[couple][_eq]": couple.id,
  });
  const members = await directusAdminRequest<MemberRow[]>(`/items/pc_couple_members?${params}`);
  const users = await Promise.all(members.map((member) => readAccountUser(member.user)));
  const partnerIndex = members.findIndex((member) => member.user !== userId);
  return {
    id: couple.id,
    status: couple.status,
    role: own.role,
    partner: partnerIndex >= 0 && users[partnerIndex] ? publicUser(users[partnerIndex]!) : null,
    shared_preferences: couple.shared_preferences,
    linked_at: own.joined_at ?? couple.date_created ?? null,
  };
}

export async function readCouple(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  return bundleForUser(userId);
}

export async function createCoupleInvite(accessToken: string, raw: unknown) {
  const input = InviteInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  if (await membershipForUser(userId)) {
    throw new CoupleError("Ya tenés una pareja vinculada.", 409, "COUPLE_ALREADY_LINKED");
  }

  // Revoca invitaciones anteriores para evitar códigos simultáneos y confusos.
  const pendingParams = new URLSearchParams({
    fields: "id",
    limit: "100",
    "filter[inviter_user][_eq]": userId,
    "filter[status][_eq]": "pending",
  });
  const pending = await directusAdminRequest<Array<{ id: string }>>(`/items/pc_couple_invites?${pendingParams}`);
  await Promise.allSettled(
    pending.map((row) =>
      directusAdminRequest(`/items/pc_couple_invites/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "revoked" }),
      }),
    ),
  );

  const code = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + input.expires_in_days * 86_400_000).toISOString();
  await directusAdminRequest<InviteRow>("/items/pc_couple_invites", {
    method: "POST",
    body: JSON.stringify({
      id: randomUUID(),
      inviter_user: userId,
      code_hash: hashInviteCode(code),
      expires_at: expiresAt,
      status: "pending",
      used_by: null,
    }),
  });

  return {
    code,
    expires_at: expiresAt,
    link: `${config.publicAppUrl}${config.publicAppUrl.includes("?") ? "&" : "?"}couple_code=${encodeURIComponent(code)}`,
  };
}

export async function acceptCoupleInvite(accessToken: string, raw: unknown) {
  const input = LinkInputSchema.parse(raw);
  const accepterId = await authenticateAccountToken(accessToken);
  if (await membershipForUser(accepterId)) {
    throw new CoupleError("Ya tenés una pareja vinculada.", 409, "COUPLE_ALREADY_LINKED");
  }

  const params = new URLSearchParams({
    fields: fields(["id", "inviter_user", "code_hash", "expires_at", "status", "used_by"]),
    limit: "1",
    "filter[code_hash][_eq]": hashInviteCode(input.code),
    "filter[status][_eq]": "pending",
  });
  const invites = await directusAdminRequest<InviteRow[]>(`/items/pc_couple_invites?${params}`);
  const invite = invites[0];
  if (!invite) throw new CoupleError("El código no es válido o ya fue usado.", 404, "COUPLE_INVITE_INVALID");
  if (invite.inviter_user === accepterId) {
    throw new CoupleError("No podés vincularte con tu propia invitación.", 409, "COUPLE_SELF_LINK");
  }
  if (Date.parse(invite.expires_at) <= Date.now()) {
    await directusAdminRequest(`/items/pc_couple_invites/${encodeURIComponent(invite.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "expired" }),
    });
    throw new CoupleError("La invitación venció.", 410, "COUPLE_INVITE_EXPIRED");
  }
  if (await membershipForUser(invite.inviter_user)) {
    throw new CoupleError("La invitación ya no está disponible.", 409, "COUPLE_INVITER_ALREADY_LINKED");
  }

  const coupleId = randomUUID();
  const memberIds = [randomUUID(), randomUUID()];
  try {
    await directusAdminRequest<CoupleRow>("/items/pc_couples", {
      method: "POST",
      body: JSON.stringify({ id: coupleId, status: "active", created_by: invite.inviter_user, shared_preferences: null }),
    });
    await directusAdminRequest<MemberRow[]>("/items/pc_couple_members", {
      method: "POST",
      body: JSON.stringify([
        { id: memberIds[0], couple: coupleId, user: invite.inviter_user, role: "owner", joined_at: new Date().toISOString() },
        { id: memberIds[1], couple: coupleId, user: accepterId, role: "partner", joined_at: new Date().toISOString() },
      ]),
    });
    await directusAdminRequest(`/items/pc_couple_invites/${encodeURIComponent(invite.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted", used_by: accepterId }),
    });
  } catch (error) {
    // Compensación best-effort: la unicidad de user evita dos parejas activas.
    await Promise.allSettled([
      ...memberIds.map((id) => directusAdminRequest(`/items/pc_couple_members/${id}`, { method: "DELETE" })),
      directusAdminRequest(`/items/pc_couples/${coupleId}`, { method: "DELETE" }),
    ]);
    throw error;
  }
  return bundleForUser(accepterId);
}

export async function updateCouplePreferences(accessToken: string, raw: unknown) {
  const input = PreferencesInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  await directusAdminRequest(`/items/pc_couples/${encodeURIComponent(membership.couple)}`, {
    method: "PATCH",
    body: JSON.stringify({ shared_preferences: input.preferences }),
  });
  return bundleForUser(userId);
}

export async function unlinkCouple(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  const params = new URLSearchParams({ fields: "id", limit: "10", "filter[couple][_eq]": membership.couple });
  const members = await directusAdminRequest<Array<{ id: string }>>(`/items/pc_couple_members?${params}`);
  await Promise.all(members.map((row) => directusAdminRequest(`/items/pc_couple_members/${row.id}`, { method: "DELETE" })));
  await directusAdminRequest(`/items/pc_couples/${membership.couple}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "closed" }),
  });
  return { unlinked: true };
}

export async function putCardSignal(accessToken: string, cardId: string, raw: unknown) {
  const input = SignalInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireMembership(userId);
  const id = stableRecordId("signal", member.couple, userId, cardId);
  const payload = { id, couple: member.couple, user: userId, card_id: cardId, response: input.response };
  try {
    await directusAdminRequest(`/items/pc_couple_card_signals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!(error instanceof DirectusRequestError) || error.status !== 404) throw error;
    try {
      await directusAdminRequest("/items/pc_couple_card_signals", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (createError) {
      // Dos dispositivos pueden registrar la misma señal a la vez. Si el otro
      // ganó la carrera, actualizamos el registro determinista ya creado.
      if (
        !(createError instanceof DirectusRequestError) ||
        ![409, 422].includes(createError.status)
      ) throw createError;
      await directusAdminRequest(`/items/pc_couple_card_signals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
  }
  return { card_id: cardId, response: input.response };
}

const positive = new Set<SignalRow["response"]>(["interested", "maybe", "repeat", "talk", "favorite", "later"]);
export async function readPrivateMatches(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireMembership(userId);
  const params = new URLSearchParams({
    fields: fields(["id", "couple", "user", "card_id", "response", "date_updated"]),
    limit: "-1",
    "filter[couple][_eq]": member.couple,
  });
  const rows = await directusAdminRequest<SignalRow[]>(`/items/pc_couple_card_signals?${params}`);
  const grouped = new Map<string, SignalRow[]>();
  for (const row of rows) grouped.set(row.card_id, [...(grouped.get(row.card_id) ?? []), row]);
  const matches = [];
  for (const [cardId, signals] of grouped) {
    const byUser = new Map(signals.map((row) => [row.user, row]));
    if (byUser.size !== 2) continue;
    const responses = [...byUser.values()].map((row) => row.response);
    if (!responses.every((response) => positive.has(response))) continue;
    const kind = responses.includes("talk") || responses.includes("maybe") ? "talk" : "match";
    matches.push({ card_id: cardId, kind, matched_at: signals.map((row) => row.date_updated).filter(Boolean).sort().at(-1) ?? null });
  }
  return matches.sort((a, b) => String(b.matched_at).localeCompare(String(a.matched_at)));
}

export async function appendCoupleHistory(accessToken: string, raw: unknown) {
  const input = HistoryInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireMembership(userId);
  const id = stableRecordId("history", member.couple, input.session_id);
  const payload = {
    id,
    couple: member.couple,
    session_id: input.session_id,
    summary: input.summary,
    created_by: userId,
  };
  try {
    return await directusAdminRequest<HistoryRow>(`/items/pc_couple_sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!(error instanceof DirectusRequestError) || error.status !== 404) throw error;
    try {
      return await directusAdminRequest<HistoryRow>("/items/pc_couple_sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (createError) {
      if (
        !(createError instanceof DirectusRequestError) ||
        ![409, 422].includes(createError.status)
      ) throw createError;
      return directusAdminRequest<HistoryRow>(`/items/pc_couple_sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
  }
}

export async function readCoupleHistory(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireMembership(userId);
  const params = new URLSearchParams({
    fields: fields(["id", "couple", "session_id", "summary", "created_by", "date_created"]),
    limit: "50",
    sort: "-date_created",
    "filter[couple][_eq]": member.couple,
  });
  return directusAdminRequest<HistoryRow[]>(`/items/pc_couple_sessions?${params}`);
}
