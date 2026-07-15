import { z } from 'zod';

const id = z.union([z.string(), z.number()]).transform(String);
const relationId = z.union([id, z.object({ id }).transform((value) => value.id), z.null()]);
const nullableString = z.string().nullable().optional().transform((value) => value ?? null);
const nullableNumber = z.coerce.number().nullable().optional().transform((value) => value ?? null);
const bool = z.coerce.boolean();
const number = z.coerce.number();

const numberWithDefault = (fallback: number) =>
  z.preprocess(
    (value) =>
      value === null || value === '' || value === undefined
        ? undefined
        : value,
    z.coerce.number().optional().default(fallback),
  );

const stringWithDefault = (fallback: string) =>
  z.preprocess(
    (value) =>
      value === null || value === undefined || value === ''
        ? undefined
        : value,
    z.string().optional().default(fallback),
  );

export const gameSchema = z.object({
  id, status: z.string(), name: z.string(), slug: z.string(), tagline: nullableString,
  description: nullableString, minimum_age: number, default_locale: z.string(), active: bool,
  theme: relationId, privacy_notice: nullableString, stop_word: z.string(), terms_url: nullableString,
  sort: nullableNumber, cover_image: relationId,
});

export const themeSchema = z.object({
  id, status: z.string(), name: z.string(), slug: z.string(),
  primary_color: z.string(), secondary_color: z.string(), accent_color: z.string(), background_color: z.string(),
  surface_color: z.string(), card_background_color: z.string(), card_border_color: z.string(), text_color: z.string(),
  muted_text_color: z.string(), danger_color: z.string(), heading_font_family: z.string(), body_font_family: z.string(),
  card_font_family: z.string(), heading_font_url: nullableString, body_font_url: nullableString, card_font_url: nullableString,
  border_radius: number, card_border_radius: number, button_height: number, card_ratio: z.string(), shadow_intensity: number,
  enable_card_flip: bool, enable_vibration: bool, enable_sounds: bool, enable_particles: bool,
  animation_speed: z.string(), logo_file: relationId, favicon_file: relationId, app_icon_file: relationId,
});

export const levelSchema = z.object({
  id, game: id, status: z.string(), name: z.string(), slug: z.string(), description: nullableString,
  intensity_order: number, color: z.string(), icon: nullableString, minimum_cards: number,
  recommended_duration_minutes: number, requires_confirmation: bool, sort: nullableNumber, background_image: relationId,
});

export const deckSchema = z.object({
  id, game: id, level: relationId, status: z.string(), name: z.string(), slug: z.string(), description: nullableString,
  deck_type: z.string(), minimum_players: number, maximum_players: number, active: bool, sort: nullableNumber, cover_image: relationId,
});

export const modeSchema = z.object({
  id, game: id, status: z.string(), name: z.string(), slug: z.string(), description: nullableString,
  starting_level: relationId, automatic_progression: bool, cards_before_level_up: number,
  allow_manual_level_change: bool, turn_mode: z.string(), skip_limit: number, session_duration_minutes: number,
  repetition_policy: z.string(), timer_policy: z.string(), sort: nullableNumber,
});

export const elementSchema = z.object({
  id, game: id, status: z.string(), name: z.string(), slug: z.string(), category: z.string(), description: nullableString,
  safety_instructions: nullableString, is_consumable: bool, is_optional: bool, sort: nullableNumber, image: relationId,
});

export const toySchema = z.object({
  id, game: id, status: z.string(), name: z.string(), slug: z.string(), category: z.string(), description: nullableString,
  intensity_min: number, difficulty: z.string(), body_safe_notice: nullableString, requires_cleaning: bool,
  cleaning_instructions: nullableString, requires_lubricant: bool, sort: nullableNumber, image: relationId,
});

export const tagSchema = z.object({
  id, game: id, status: z.string(), name: z.string(), slug: z.string(), category: z.string(), color: nullableString, sort: nullableNumber,
});

export const sexSchema = z.object({
  id, game: id, status: z.string(), name: z.string(), slug: z.string(),
  description: nullableString, sort: nullableNumber,
});

export const cardSchema = z.object({
  id, game: id, level: id, status: z.string(), sort: nullableNumber, code: z.string(), title: nullableString,
  text: z.string().min(1), instructions: nullableString, card_type: z.string(), original_deck: nullableString,
  duration_seconds: nullableNumber, weight: number, intensity: number, minimum_players: number, maximum_players: number,
  performer: z.string(), target: z.string(), performer_sex: relationId.optional().default(null), target_sex: relationId.optional().default(null), allow_skip: bool, requires_confirmation: bool, safety_note: nullableString,
  privacy_risk: number, physical_risk: number, gender_scope: z.string(), language: z.string(),
  contains_oral: bool, contains_penetration: bool, contains_anal: bool.optional().default(false), contains_restraint: bool, contains_food: bool,
  contains_temperature: bool, contains_public_place: bool, contains_third_parties: bool, contains_photo: bool,
  contains_video: bool, contains_nudity: bool, contains_roleplay: bool, contains_toy: bool,
  contains_manual_stimulation: bool, contains_explicit_language: bool, requires_device: bool, requires_private_space: bool,
  gm_escalation_score: numberWithDefault(0),
  gm_energy_score: numberWithDefault(3),
  gm_intimacy_score: numberWithDefault(3),
  gm_humor_score: numberWithDefault(0),
  gm_recovery_score: numberWithDefault(0),
  gm_novelty_score: numberWithDefault(3),
  gm_continuity_group: nullableString,
  gm_scene_role: stringWithDefault('continuation'),
});

export const deckCardSchema = z.object({ id, deck: id, card: id, sort: nullableNumber, enabled: bool });
export const cardElementSchema = z.object({
  id, card: id, element: id, requirement: z.string(), quantity: number, preparation_note: nullableString, sort: nullableNumber,
});
export const cardToySchema = z.object({
  id, card: id, toy: id, requirement: z.string(), quantity: number, preparation_note: nullableString, sort: nullableNumber,
});
export const cardTagSchema = z.object({ id, card: id, tag: id, sort: nullableNumber });

export const settingsSchema = z.object({
  id, game: id, status: z.string(), default_mode: relationId, default_level: relationId,
  start_screen_title: z.string(), intro_text: z.string(), instructions_text: z.string(), safety_text: z.string(), stop_word: z.string(),
  age_gate_enabled: bool, show_timer: bool, allow_screen_wake_lock: bool, allow_fullscreen: bool, allow_vibration: bool,
  allow_offline: bool, maximum_cards_per_session: number, enable_random_level: bool, enable_private_filters: bool,
  analytics_enabled: bool, maintenance_mode: bool, default_exclude_photo_video: bool,
  default_exclude_third_parties: bool, default_exclude_public_places: bool, default_exclude_restraint: bool,
  setup_step_1_label: z.string().optional().default('Personas y modo'),
  setup_step_1_title: z.string().optional().default('¿Quiénes juegan y cómo?'),
  setup_step_1_subtitle: z.string().optional().default('Los nombres son opcionales. Elegí el sexo de cada persona para que las cartas correspondan a quien tiene el turno.'),
  setup_step_2_label: z.string().optional().default('Niveles y mazos'),
  setup_step_2_title: z.string().optional().default('Definan la intensidad'),
  setup_step_2_subtitle: z.string().optional().default('Elijan solamente los niveles que realmente quieran incluir en la partida.'),
  setup_step_3_label: z.string().optional().default('Elementos'),
  setup_step_3_title: z.string().optional().default('¿Qué tienen disponible?'),
  setup_step_3_subtitle: z.string().optional().default('Las cartas que necesiten algo no seleccionado quedarán fuera de la partida.'),
  setup_step_4_label: z.string().optional().default('Límites'),
  setup_step_4_title: z.string().optional().default('Marquen los límites'),
  setup_step_4_subtitle: z.string().optional().default('Activen todo lo que prefieran dejar afuera antes de empezar.'),
  game_master_enabled: bool.optional().default(false),
  game_master_default_on: bool.optional().default(false),
  game_master_title: stringWithDefault('Game Master adaptativo'),
  game_master_description: stringWithDefault('Adapta la intensidad, el ritmo y la continuidad según cómo avanza la partida.'),
  game_master_show_reactions: bool.optional().default(true),
});

export const releaseSchema = z.object({
  id, game: id, status: z.string(), version: z.string(), published_at: z.string(), changelog: nullableString,
  minimum_app_version: z.string(), config_hash: nullableString,
});
