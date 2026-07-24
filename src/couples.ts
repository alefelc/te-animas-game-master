import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
const LinkInputSchema = z.object({ code: z.string().trim().min(24).max(256) });

const SavedGamePreferencesSchema = z.object({
  version: z.literal(1),
  playerOne: z.string().max(24),
  playerTwo: z.string().max(24),
  playerOneSexSlug: z.string().max(120).nullable(),
  playerTwoSexSlug: z.string().max(120).nullable(),
  modeSlug: z.string().max(120).nullable(),
  levelSlugs: z.array(z.string().max(120)).max(30),
  deckSlugs: z.array(z.string().max(120)).max(100),
  elementSlugs: z.array(z.string().max(120)).max(60),
  toySlugs: z.array(z.string().max(120)).max(60),
  filters: z.record(z.string().max(80), z.union([z.boolean(), z.number().finite()])).refine(
    (value) => Object.keys(value).length <= 80,
    "Hay demasiados filtros compartidos.",
  ),
  maxCards: z.number().int().min(1).max(500),
  gameMasterEnabled: z.boolean(),
}).strict();

const PreferencesInputSchema = z.object({
  preferences: SavedGamePreferencesSchema.nullable(),
  expected_revision: z.number().int().min(0).optional(),
}).strict();

const SignalInputSchema = z.object({
  response: z.enum(["interested", "maybe", "no", "repeat", "talk", "blocked", "favorite", "later"]),
}).strict();

const HistorySummarySchema = z.object({
  started_at: z.string().datetime().nullable().optional(),
  ended_at: z.string().datetime().nullable().optional(),
  completed_cards: z.number().int().min(0).max(500),
  skipped_cards: z.number().int().min(0).max(500),
  reached_phase: z.string().max(32).nullable(),
  climax_reached: z.boolean(),
}).strict();

const HistoryInputSchema = z.object({
  session_id: z.string().min(1).max(128),
  summary: HistorySummarySchema.nullable().optional().default(null),
}).strict();

interface CoupleRow {
  id: string;
  status: "active" | "closing" | "closed";
  created_by: string;
  source_invite?: string | null;
  shared_preferences: unknown | null;
  preferences_revision?: number | null;
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
interface InviteClaimRow {
  id: string;
  invite: string;
  accepter_user: string;
  status: "claimed" | "completed" | "failed";
  claimed_at?: string | null;
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
  summary: z.infer<typeof HistorySummarySchema> | null;
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

function equalHash(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function stableRecordId(...parts: string[]) {
  const hex = createHash("sha256").update(parts.join(":"), "utf8").digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isUniqueConflict(error: unknown): error is DirectusRequestError {
  return error instanceof DirectusRequestError && (
    [409, 422].includes(error.status) ||
    (error.status === 400 && error.code === "RECORD_NOT_UNIQUE")
  );
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
    `/items/pc_couples/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields([
      "id",
      "status",
      "created_by",
      "source_invite",
      "shared_preferences",
      "preferences_revision",
      "date_created",
      "date_updated",
    ]))}`,
  );
}

async function requireActiveMembership(userId: string): Promise<MemberRow> {
  const member = await requireMembership(userId);
  const couple = await coupleById(member.couple);
  if (couple.status !== "active") {
    throw new CoupleError("La vinculación ya no está activa.", 409, "COUPLE_NOT_ACTIVE");
  }
  return member;
}

function publicUser(user: AccountUser) {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

async function membersForCouple(coupleId: string) {
  const params = new URLSearchParams({
    fields: fields(["id", "couple", "user", "role", "joined_at"]),
    limit: "2",
    "filter[couple][_eq]": coupleId,
  });
  return directusAdminRequest<MemberRow[]>(`/items/pc_couple_members?${params}`);
}

async function bundleForUser(userId: string) {
  const own = await membershipForUser(userId);
  if (!own) return null;
  const couple = await coupleById(own.couple);
  if (couple.status !== "active") return null;
  const members = await membersForCouple(couple.id);
  const users = await Promise.all(members.map((member) => readAccountUser(member.user)));
  const partnerIndex = members.findIndex((member) => member.user !== userId);
  return {
    id: couple.id,
    status: couple.status,
    role: own.role,
    partner: partnerIndex >= 0 && users[partnerIndex] ? publicUser(users[partnerIndex]!) : null,
    shared_preferences: couple.shared_preferences,
    preferences_revision: couple.preferences_revision ?? 0,
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

  const base = config.publicAppUrl.replace(/#.*$/, "");
  return {
    code,
    expires_at: expiresAt,
    // El fragmento no viaja al servidor, proxies, analítica ni cabecera Referer.
    link: `${base}#couple_code=${encodeURIComponent(code)}`,
  };
}

async function claimInvite(invite: InviteRow, accepterId: string) {
  const claimId = stableRecordId("invite-claim", invite.id);
  const payload: InviteClaimRow = {
    id: claimId,
    invite: invite.id,
    accepter_user: accepterId,
    status: "claimed",
    claimed_at: new Date().toISOString(),
  };

  try {
    await directusAdminRequest<InviteClaimRow>("/items/pc_couple_invite_claims", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const existing = await directusAdminRequest<InviteClaimRow>(
      `/items/pc_couple_invite_claims/${claimId}?fields=id,invite,accepter_user,status,claimed_at`,
    );
    if (existing.accepter_user !== accepterId) {
      throw new CoupleError("La invitación ya está siendo utilizada.", 409, "COUPLE_INVITE_CLAIMED");
    }
  }
  return claimId;
}

async function createMemberIdempotently(payload: MemberRow) {
  try {
    await directusAdminRequest<MemberRow>("/items/pc_couple_members", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const existing = await membershipForUser(payload.user);
    if (!existing || existing.couple !== payload.couple) {
      throw new CoupleError("Una de las cuentas ya pertenece a otra pareja.", 409, "COUPLE_ALREADY_LINKED");
    }
  }
}

export async function acceptCoupleInvite(accessToken: string, raw: unknown) {
  const input = LinkInputSchema.parse(raw);
  const accepterId = await authenticateAccountToken(accessToken);
  if (await membershipForUser(accepterId)) {
    throw new CoupleError("Ya tenés una pareja vinculada.", 409, "COUPLE_ALREADY_LINKED");
  }

  const requestedHash = hashInviteCode(input.code);
  const params = new URLSearchParams({
    fields: fields(["id", "inviter_user", "code_hash", "expires_at", "status", "used_by"]),
    limit: "1",
    "filter[code_hash][_eq]": requestedHash,
    "filter[status][_eq]": "pending",
  });
  const invites = await directusAdminRequest<InviteRow[]>(`/items/pc_couple_invites?${params}`);
  const invite = invites[0];
  if (!invite || !equalHash(invite.code_hash, requestedHash)) {
    throw new CoupleError("El código no es válido o ya fue usado.", 404, "COUPLE_INVITE_INVALID");
  }
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

  const claimId = await claimInvite(invite, accepterId);
  const coupleId = stableRecordId("couple", invite.id);
  const joinedAt = new Date().toISOString();

  try {
    const inviterMembership = await membershipForUser(invite.inviter_user);
    if (inviterMembership && inviterMembership.couple !== coupleId) {
      throw new CoupleError("La invitación ya no está disponible.", 409, "COUPLE_INVITER_ALREADY_LINKED");
    }
    const accepterMembership = await membershipForUser(accepterId);
    if (accepterMembership && accepterMembership.couple !== coupleId) {
      throw new CoupleError("Ya tenés una pareja vinculada.", 409, "COUPLE_ALREADY_LINKED");
    }

    try {
      await directusAdminRequest<CoupleRow>("/items/pc_couples", {
        method: "POST",
        body: JSON.stringify({
          id: coupleId,
          status: "active",
          created_by: invite.inviter_user,
          source_invite: invite.id,
          shared_preferences: null,
          preferences_revision: 0,
        }),
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const existing = await coupleById(coupleId);
      if (existing.source_invite && existing.source_invite !== invite.id) throw error;
    }

    await createMemberIdempotently({
      id: stableRecordId("member", coupleId, invite.inviter_user),
      couple: coupleId,
      user: invite.inviter_user,
      role: "owner",
      joined_at: joinedAt,
    });
    await createMemberIdempotently({
      id: stableRecordId("member", coupleId, accepterId),
      couple: coupleId,
      user: accepterId,
      role: "partner",
      joined_at: joinedAt,
    });

    await directusAdminRequest(`/items/pc_couple_invites/${encodeURIComponent(invite.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted", used_by: accepterId }),
    });
    await directusAdminRequest(`/items/pc_couple_invite_claims/${claimId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
  } catch (error) {
    await Promise.allSettled([
      directusAdminRequest(`/items/pc_couple_invite_claims/${claimId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed" }),
      }),
    ]);
    // No se destruyen registros parciales: IDs deterministas permiten reintentar
    // de forma idempotente sin que una solicitud concurrente borre el vínculo ganador.
    throw error;
  }
  return bundleForUser(accepterId);
}

export async function updateCouplePreferences(accessToken: string, raw: unknown) {
  const input = PreferencesInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireActiveMembership(userId);
  const couple = await coupleById(membership.couple);
  const currentRevision = couple.preferences_revision ?? 0;
  if (input.expected_revision !== undefined && input.expected_revision !== currentRevision) {
    throw new CoupleError(
      "Las preferencias cambiaron en el otro dispositivo. Actualizá y volvé a guardar.",
      409,
      "COUPLE_PREFERENCES_CONFLICT",
    );
  }
  const params = new URLSearchParams({
    fields: "id,preferences_revision",
    "filter[id][_eq]": membership.couple,
    "filter[status][_eq]": "active",
    "filter[preferences_revision][_eq]": String(currentRevision),
  });
  const updated = await directusAdminRequest<Array<{ id: string; preferences_revision: number }>>(
    `/items/pc_couples?${params}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        shared_preferences: input.preferences,
        preferences_revision: currentRevision + 1,
      }),
    },
  );
  if (!Array.isArray(updated) || updated.length !== 1) {
    throw new CoupleError(
      "Las preferencias cambiaron en el otro dispositivo. Actualizá y volvé a guardar.",
      409,
      "COUPLE_PREFERENCES_CONFLICT",
    );
  }
  return bundleForUser(userId);
}

async function listIds(path: string) {
  return directusAdminRequest<Array<{ id: string }>>(path);
}

async function deleteRows(collection: string, rows: Array<{ id: string }>) {
  await Promise.all(
    rows.map(async (row) => {
      try {
        await directusAdminRequest(`/items/${collection}/${encodeURIComponent(row.id)}`, {
          method: "DELETE",
        });
      } catch (error) {
        // La eliminación es idempotente: una fila ya ausente no es un fallo.
        if (!(error instanceof DirectusRequestError) || error.status !== 404) throw error;
      }
    }),
  );
}

export async function unlinkCouple(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  const coupleId = membership.couple;
  await directusAdminRequest(`/items/pc_couples/${coupleId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "closing" }),
  });

  const members = await membersForCouple(coupleId);
  const [signals, sessions] = await Promise.all([
    listIds(`/items/pc_couple_card_signals?fields=id&limit=-1&filter[couple][_eq]=${encodeURIComponent(coupleId)}`),
    listIds(`/items/pc_couple_sessions?fields=id&limit=-1&filter[couple][_eq]=${encodeURIComponent(coupleId)}`),
  ]);
  await Promise.all([
    deleteRows("pc_couple_card_signals", signals),
    deleteRows("pc_couple_sessions", sessions),
  ]);

  const inviteGroups = await Promise.all(
    members.flatMap((member) => [
      listIds(`/items/pc_couple_invites?fields=id&limit=-1&filter[inviter_user][_eq]=${encodeURIComponent(member.user)}`),
      listIds(`/items/pc_couple_invites?fields=id&limit=-1&filter[used_by][_eq]=${encodeURIComponent(member.user)}`),
    ]),
  );
  const invites = [...new Map(inviteGroups.flat().map((row) => [row.id, row])).values()];
  const claims = (
    await Promise.all(
      invites.map((invite) =>
        listIds(`/items/pc_couple_invite_claims?fields=id&limit=-1&filter[invite][_eq]=${encodeURIComponent(invite.id)}`),
      ),
    )
  ).flat();
  await deleteRows("pc_couple_invite_claims", claims);
  await deleteRows("pc_couple_invites", invites);
  await deleteRows("pc_couple_members", members);

  await directusAdminRequest(`/items/pc_couples/${coupleId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "closed",
      shared_preferences: null,
      preferences_revision: 0,
    }),
  });
  return { unlinked: true, private_data_deleted: true };
}

export async function putCardSignal(accessToken: string, cardIdRaw: string, raw: unknown) {
  const cardId = z.string().trim().uuid().parse(cardIdRaw);
  const input = SignalInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireActiveMembership(userId);
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
      if (!isUniqueConflict(createError)) throw createError;
      await directusAdminRequest(`/items/pc_couple_card_signals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
  }
  return { card_id: cardId, response: input.response };
}

export async function readOwnCardSignal(accessToken: string, cardIdRaw: string) {
  const cardId = z.string().trim().uuid().parse(cardIdRaw);
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireActiveMembership(userId);
  const id = stableRecordId("signal", member.couple, userId, cardId);
  try {
    const row = await directusAdminRequest<SignalRow>(
      `/items/pc_couple_card_signals/${id}?fields=id,card_id,response,date_updated`,
    );
    return { card_id: row.card_id, response: row.response, updated_at: row.date_updated ?? null };
  } catch (error) {
    if (error instanceof DirectusRequestError && error.status === 404) return null;
    throw error;
  }
}

const strongPositive = new Set<SignalRow["response"]>(["interested", "repeat", "favorite"]);
const discussPositive = new Set<SignalRow["response"]>(["maybe", "talk", "later"]);
export async function readPrivateMatches(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireActiveMembership(userId);
  const members = await membersForCouple(member.couple);
  if (members.length !== 2) return [];
  const memberIds = new Set(members.map((row) => row.user));
  const params = new URLSearchParams({
    fields: fields(["id", "couple", "user", "card_id", "response", "date_updated"]),
    limit: "-1",
    "filter[couple][_eq]": member.couple,
  });
  const rows = (await directusAdminRequest<SignalRow[]>(`/items/pc_couple_card_signals?${params}`))
    .filter((row) => memberIds.has(row.user));
  const grouped = new Map<string, SignalRow[]>();
  for (const row of rows) grouped.set(row.card_id, [...(grouped.get(row.card_id) ?? []), row]);
  const matches: Array<{ card_id: string; kind: "match" | "talk"; matched_at: string | null }> = [];
  for (const [cardId, signals] of grouped) {
    const byUser = new Map(signals.map((row) => [row.user, row]));
    if (byUser.size !== 2) continue;
    const responses = [...byUser.values()].map((row) => row.response);
    if (!responses.every((response) => strongPositive.has(response) || discussPositive.has(response))) continue;
    const kind = responses.some((response) => discussPositive.has(response)) ? "talk" : "match";
    matches.push({
      card_id: cardId,
      kind,
      matched_at: signals.map((row) => row.date_updated).filter(Boolean).sort().at(-1) ?? null,
    });
  }
  return matches.sort((a, b) => String(b.matched_at).localeCompare(String(a.matched_at)));
}

export async function appendCoupleHistory(accessToken: string, raw: unknown) {
  const input = HistoryInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireActiveMembership(userId);
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
      if (!isUniqueConflict(createError)) throw createError;
      return directusAdminRequest<HistoryRow>(`/items/pc_couple_sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
  }
}

export async function readCoupleHistory(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const member = await requireActiveMembership(userId);
  const params = new URLSearchParams({
    fields: fields(["id", "couple", "session_id", "summary", "created_by", "date_created"]),
    limit: "50",
    sort: "-date_created",
    "filter[couple][_eq]": member.couple,
  });
  return directusAdminRequest<HistoryRow[]>(`/items/pc_couple_sessions?${params}`);
}
