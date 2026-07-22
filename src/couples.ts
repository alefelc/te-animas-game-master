import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import {
  authenticateAccountToken,
  directusAdminRequest,
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

type SignalResponse = z.infer<typeof SignalInputSchema>["response"];
interface StoredSignal {
  response: SignalResponse;
  updated_at: string;
}
interface HistoryRow {
  id: string;
  couple: string;
  session_id: string;
  summary: unknown | null;
  created_by: string;
  date_created: string;
}
interface CoupleProfileRow {
  id: string | number;
  user: string;
  preferences?: unknown | null;
  couple_id?: string | null;
  partner_user?: string | null;
  couple_role?: "owner" | "partner" | null;
  couple_status?: "active" | "closed" | null;
  linked_at?: string | null;
  shared_preferences?: unknown | null;
  couple_signals?: unknown | null;
  couple_history?: unknown | null;
  invite_code_hash?: string | null;
  invite_expires_at?: string | null;
  invite_status?: "pending" | "accepted" | "revoked" | "expired" | null;
  invite_used_by?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
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

const PROFILE_FIELDS = [
  "id",
  "user",
  "preferences",
  "couple_id",
  "partner_user",
  "couple_role",
  "couple_status",
  "linked_at",
  "shared_preferences",
  "couple_signals",
  "couple_history",
  "invite_code_hash",
  "invite_expires_at",
  "invite_status",
  "invite_used_by",
  "date_created",
  "date_updated",
].join(",");

function hashInviteCode(code: string) {
  return createHmac("sha256", config.coupleInvitePepper)
    .update(code.trim())
    .digest("hex");
}

function stableRecordId(...parts: string[]) {
  const hex = createHash("sha256").update(parts.join(":"), "utf8").digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function publicUser(user: AccountUser) {
  return { id: user.id, first_name: user.first_name, last_name: user.last_name };
}

function profileQuery(field: "user" | "invite_code_hash", value: string) {
  const params = new URLSearchParams({
    fields: PROFILE_FIELDS,
    limit: "1",
    [`filter[${field}][_eq]`]: value,
  });
  return `/items/pc_user_profiles?${params.toString()}`;
}

async function readProfileByUser(userId: string): Promise<CoupleProfileRow | null> {
  const rows = await directusAdminRequest<CoupleProfileRow[]>(profileQuery("user", userId));
  return rows[0] ?? null;
}

async function readProfileByInviteHash(hash: string): Promise<CoupleProfileRow | null> {
  const rows = await directusAdminRequest<CoupleProfileRow[]>(profileQuery("invite_code_hash", hash));
  return rows[0] ?? null;
}

async function ensureProfile(userId: string): Promise<CoupleProfileRow> {
  const existing = await readProfileByUser(userId);
  if (existing) return existing;
  try {
    return await directusAdminRequest<CoupleProfileRow>(
      `/items/pc_user_profiles?fields=${encodeURIComponent(PROFILE_FIELDS)}`,
      {
        method: "POST",
        body: JSON.stringify({ user: userId, preferences: null }),
      },
    );
  } catch (error) {
    const raced = await readProfileByUser(userId);
    if (raced) return raced;
    throw error;
  }
}

async function patchProfile(
  profileId: string | number,
  data: Record<string, unknown>,
): Promise<CoupleProfileRow> {
  return directusAdminRequest<CoupleProfileRow>(
    `/items/pc_user_profiles/${encodeURIComponent(String(profileId))}?fields=${encodeURIComponent(PROFILE_FIELDS)}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

async function conditionalPatchProfile(
  filter: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<CoupleProfileRow | null> {
  const rows = await directusAdminRequest<CoupleProfileRow[]>(
    `/items/pc_user_profiles?fields=${encodeURIComponent(PROFILE_FIELDS)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ data, query: { filter } }),
    },
  );
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

function activeMembership(profile: CoupleProfileRow | null) {
  if (
    !profile ||
    profile.couple_status !== "active" ||
    !profile.couple_id ||
    !profile.partner_user ||
    !profile.couple_role
  ) return null;
  return {
    profile,
    couple: profile.couple_id,
    user: profile.user,
    partner: profile.partner_user,
    role: profile.couple_role,
  };
}

async function membershipForUser(userId: string) {
  return activeMembership(await readProfileByUser(userId));
}

async function requireMembership(userId: string) {
  const membership = await membershipForUser(userId);
  if (!membership) throw new CoupleError("No hay una pareja vinculada.", 404, "COUPLE_NOT_LINKED");
  return membership;
}

async function bundleForUser(userId: string) {
  const own = await membershipForUser(userId);
  if (!own) return null;
  const partner = await readAccountUser(own.partner);
  return {
    id: own.couple,
    status: "active" as const,
    role: own.role,
    partner: publicUser(partner),
    shared_preferences: own.profile.shared_preferences ?? null,
    linked_at: own.profile.linked_at ?? own.profile.date_updated ?? own.profile.date_created ?? null,
  };
}

function signalsFrom(value: unknown): Record<string, StoredSignal> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, StoredSignal> = {};
  for (const [cardId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const parsed = SignalInputSchema.safeParse({ response: record.response });
    if (!parsed.success) continue;
    output[cardId] = {
      response: parsed.data.response,
      updated_at: typeof record.updated_at === "string" ? record.updated_at : new Date(0).toISOString(),
    };
  }
  return output;
}

function historyFrom(value: unknown): HistoryRow[] {
  if (!Array.isArray(value)) return [];
  const rows: HistoryRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.couple !== "string" ||
      typeof row.session_id !== "string" ||
      typeof row.created_by !== "string" ||
      typeof row.date_created !== "string"
    ) continue;
    rows.push({
      id: row.id,
      couple: row.couple,
      session_id: row.session_id,
      summary: row.summary ?? null,
      created_by: row.created_by,
      date_created: row.date_created,
    });
  }
  return rows;
}

const clearCoupleData = {
  couple_id: null,
  partner_user: null,
  couple_role: null,
  couple_status: null,
  linked_at: null,
  shared_preferences: null,
  couple_signals: null,
  couple_history: null,
};

export async function readCouple(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  return bundleForUser(userId);
}

export async function createCoupleInvite(accessToken: string, raw: unknown) {
  const input = InviteInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const profile = await ensureProfile(userId);
  if (activeMembership(profile)) {
    throw new CoupleError("Ya tenés una pareja vinculada.", 409, "COUPLE_ALREADY_LINKED");
  }

  const code = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + input.expires_in_days * 86_400_000).toISOString();
  await patchProfile(profile.id, {
    invite_code_hash: hashInviteCode(code),
    invite_expires_at: expiresAt,
    invite_status: "pending",
    invite_used_by: null,
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
  const accepterProfile = await ensureProfile(accepterId);
  if (activeMembership(accepterProfile)) {
    throw new CoupleError("Ya tenés una pareja vinculada.", 409, "COUPLE_ALREADY_LINKED");
  }

  const codeHash = hashInviteCode(input.code);
  const inviterProfile = await readProfileByInviteHash(codeHash);
  if (!inviterProfile || inviterProfile.invite_status !== "pending") {
    throw new CoupleError("El código no es válido o ya fue usado.", 404, "COUPLE_INVITE_INVALID");
  }
  if (inviterProfile.user === accepterId) {
    throw new CoupleError("No podés vincularte con tu propia invitación.", 409, "COUPLE_SELF_LINK");
  }
  if (!inviterProfile.invite_expires_at || Date.parse(inviterProfile.invite_expires_at) <= Date.now()) {
    await patchProfile(inviterProfile.id, { invite_status: "expired" });
    throw new CoupleError("La invitación venció.", 410, "COUPLE_INVITE_EXPIRED");
  }
  if (activeMembership(inviterProfile)) {
    throw new CoupleError("La invitación ya no está disponible.", 409, "COUPLE_INVITER_ALREADY_LINKED");
  }

  const coupleId = randomUUID();
  const linkedAt = new Date().toISOString();
  const inviterClaim = await conditionalPatchProfile(
    {
      _and: [
        { id: { _eq: inviterProfile.id } },
        { invite_code_hash: { _eq: codeHash } },
        { invite_status: { _eq: "pending" } },
        { couple_id: { _null: true } },
      ],
    },
    {
      couple_id: coupleId,
      partner_user: accepterId,
      couple_role: "owner",
      couple_status: "active",
      linked_at: linkedAt,
      shared_preferences: null,
      couple_signals: {},
      couple_history: [],
      invite_status: "accepted",
      invite_used_by: accepterId,
    },
  );
  if (!inviterClaim) {
    throw new CoupleError("La invitación ya fue utilizada.", 409, "COUPLE_INVITE_ALREADY_USED");
  }

  const accepterClaim = await conditionalPatchProfile(
    {
      _and: [
        { id: { _eq: accepterProfile.id } },
        { couple_id: { _null: true } },
      ],
    },
    {
      couple_id: coupleId,
      partner_user: inviterProfile.user,
      couple_role: "partner",
      couple_status: "active",
      linked_at: linkedAt,
      shared_preferences: null,
      couple_signals: {},
      couple_history: [],
      invite_code_hash: null,
      invite_expires_at: null,
      invite_status: null,
      invite_used_by: null,
    },
  );

  if (!accepterClaim) {
    await conditionalPatchProfile(
      {
        _and: [
          { id: { _eq: inviterProfile.id } },
          { couple_id: { _eq: coupleId } },
          { partner_user: { _eq: accepterId } },
        ],
      },
      {
        ...clearCoupleData,
        invite_status: "pending",
        invite_used_by: null,
      },
    );
    throw new CoupleError("La cuenta ya fue vinculada desde otro dispositivo.", 409, "COUPLE_ALREADY_LINKED");
  }

  return bundleForUser(accepterId);
}

export async function updateCouplePreferences(accessToken: string, raw: unknown) {
  const input = PreferencesInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  const partnerProfile = await readProfileByUser(membership.partner);
  if (!activeMembership(partnerProfile) || partnerProfile?.couple_id !== membership.couple) {
    throw new CoupleError("El vínculo de pareja está incompleto.", 409, "COUPLE_INCONSISTENT");
  }
  await Promise.all([
    patchProfile(membership.profile.id, { shared_preferences: input.preferences }),
    patchProfile(partnerProfile.id, { shared_preferences: input.preferences }),
  ]);
  return bundleForUser(userId);
}

export async function unlinkCouple(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  const partnerProfile = await readProfileByUser(membership.partner);
  const tasks: Array<Promise<unknown>> = [patchProfile(membership.profile.id, clearCoupleData)];
  if (partnerProfile?.couple_id === membership.couple) {
    tasks.push(patchProfile(partnerProfile.id, clearCoupleData));
  }
  await Promise.all(tasks);
  return { unlinked: true };
}

export async function putCardSignal(accessToken: string, cardId: string, raw: unknown) {
  const input = SignalInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  const signals = signalsFrom(membership.profile.couple_signals);
  signals[cardId] = { response: input.response, updated_at: new Date().toISOString() };
  await patchProfile(membership.profile.id, { couple_signals: signals });
  return { card_id: cardId, response: input.response };
}

const positive = new Set<SignalResponse>(["interested", "maybe", "repeat", "talk", "favorite", "later"]);
export async function readPrivateMatches(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  const partnerProfile = await readProfileByUser(membership.partner);
  if (!partnerProfile || partnerProfile.couple_id !== membership.couple) return [];
  const own = signalsFrom(membership.profile.couple_signals);
  const partner = signalsFrom(partnerProfile.couple_signals);
  const matches: Array<{ card_id: string; kind: "match" | "talk"; matched_at: string | null }> = [];
  for (const [cardId, ownSignal] of Object.entries(own)) {
    const partnerSignal = partner[cardId];
    if (!partnerSignal) continue;
    if (!positive.has(ownSignal.response) || !positive.has(partnerSignal.response)) continue;
    const kind = [ownSignal.response, partnerSignal.response].some((value) => value === "talk" || value === "maybe")
      ? "talk"
      : "match";
    matches.push({
      card_id: cardId,
      kind,
      matched_at: [ownSignal.updated_at, partnerSignal.updated_at].sort().at(-1) ?? null,
    });
  }
  return matches.sort((a, b) => String(b.matched_at).localeCompare(String(a.matched_at)));
}

export async function appendCoupleHistory(accessToken: string, raw: unknown) {
  const input = HistoryInputSchema.parse(raw);
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  const partnerProfile = await readProfileByUser(membership.partner);
  if (!partnerProfile || partnerProfile.couple_id !== membership.couple) {
    throw new CoupleError("El vínculo de pareja está incompleto.", 409, "COUPLE_INCONSISTENT");
  }
  const row: HistoryRow = {
    id: stableRecordId("history", membership.couple, input.session_id),
    couple: membership.couple,
    session_id: input.session_id,
    summary: input.summary,
    created_by: userId,
    date_created: new Date().toISOString(),
  };
  const merged = [
    row,
    ...historyFrom(membership.profile.couple_history).filter((item) => item.session_id !== input.session_id),
  ]
    .sort((a, b) => b.date_created.localeCompare(a.date_created))
    .slice(0, 50);
  await Promise.all([
    patchProfile(membership.profile.id, { couple_history: merged }),
    patchProfile(partnerProfile.id, { couple_history: merged }),
  ]);
  return row;
}

export async function readCoupleHistory(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const membership = await requireMembership(userId);
  return historyFrom(membership.profile.couple_history)
    .sort((a, b) => b.date_created.localeCompare(a.date_created))
    .slice(0, 50);
}
