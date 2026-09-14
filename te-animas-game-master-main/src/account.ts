import { z } from "zod";
import {
  authenticateAccountToken,
  inviteAccountUser,
  DirectusRequestError,
  readAccountProfile,
  readAccountUser,
  saveAccountProfile,
  updateAccountUser,
  type AccountUser,
  type StoredProfile,
} from "./directus.js";

const shortText = z.string().trim().max(80);
const slug = z.string().trim().min(1).max(120);

export const SavedGamePreferencesSchema = z.object({
  version: z.literal(1),
  playerOne: z.string().trim().max(24),
  playerTwo: z.string().trim().max(24),
  playerOneSexSlug: slug.nullable(),
  playerTwoSexSlug: slug.nullable(),
  modeSlug: slug.nullable(),
  levelSlugs: z.array(slug).max(20),
  deckSlugs: z.array(slug).max(50),
  elementSlugs: z.array(slug).max(50),
  toySlugs: z.array(slug).max(50),
  filters: z.record(
    z.string().trim().min(1).max(100),
    z.union([z.boolean(), z.number().finite().min(-1000).max(1000)]),
  ),
  maxCards: z.number().int().min(5).max(500),
  gameMasterEnabled: z.boolean(),
}).strict();

export const SaveProfileSchema = z.object({
  preferences: SavedGamePreferencesSchema.nullable(),
}).strict();

export const UpdateAccountSchema = z.object({
  first_name: shortText.nullable(),
  last_name: shortText.nullable(),
}).strict();


export const RegisterAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().min(1).max(50),
}).strict();

export async function registerAccount(input: unknown): Promise<void> {
  const data = RegisterAccountSchema.parse(input);
  await inviteAccountUser(data);
}

export interface AccountBundle {
  user: AccountUser;
  profile: StoredProfile | null;
}

export async function authenticateAccount(accessToken: string) {
  const userId = await authenticateAccountToken(accessToken);
  const user = await readAccountUser(userId);
  if (user.status !== "active") {
    throw new DirectusRequestError(
      "La cuenta no está activa.",
      403,
      "ACCOUNT_INACTIVE",
      "/users/me",
    );
  }
  return { userId, user };
}

export async function readAccountBundle(accessToken: string): Promise<AccountBundle> {
  const { userId, user } = await authenticateAccount(accessToken);
  const profile = await readAccountProfile(userId);
  return { user, profile };
}

export async function patchAccount(
  accessToken: string,
  input: unknown,
): Promise<AccountUser> {
  const data = UpdateAccountSchema.parse(input);
  const { userId } = await authenticateAccount(accessToken);
  return updateAccountUser(userId, {
    first_name: data.first_name?.trim() || null,
    last_name: data.last_name?.trim() || null,
  });
}

export async function readProfile(accessToken: string): Promise<StoredProfile | null> {
  const { userId } = await authenticateAccount(accessToken);
  return readAccountProfile(userId);
}

export async function putProfile(
  accessToken: string,
  input: unknown,
): Promise<StoredProfile> {
  const data = SaveProfileSchema.parse(input);
  const { userId } = await authenticateAccount(accessToken);
  return saveAccountProfile(userId, data.preferences);
}
