export type Id = string;
export type ContentSource = 'network' | 'cache' | 'bootstrap';

export interface Game {
  id: Id;
  status: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  minimum_age: number;
  default_locale: string;
  active: boolean;
  theme: Id | null;
  privacy_notice: string | null;
  stop_word: string;
  terms_url: string | null;
  sort: number | null;
  cover_image: Id | null;
}

export interface Theme {
  id: Id;
  status: string;
  name: string;
  slug: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  surface_color: string;
  card_background_color: string;
  card_border_color: string;
  text_color: string;
  muted_text_color: string;
  danger_color: string;
  heading_font_family: string;
  body_font_family: string;
  card_font_family: string;
  heading_font_url: string | null;
  body_font_url: string | null;
  card_font_url: string | null;
  border_radius: number;
  card_border_radius: number;
  button_height: number;
  card_ratio: string;
  shadow_intensity: number;
  enable_card_flip: boolean;
  enable_vibration: boolean;
  enable_sounds: boolean;
  enable_particles: boolean;
  animation_speed: 'slow' | 'normal' | 'fast' | string;
  logo_file: Id | null;
  favicon_file: Id | null;
  app_icon_file: Id | null;
}

export interface Level {
  id: Id;
  game: Id;
  status: string;
  name: string;
  slug: string;
  description: string | null;
  intensity_order: number;
  color: string;
  icon: string | null;
  minimum_cards: number;
  recommended_duration_minutes: number;
  requires_confirmation: boolean;
  sort: number | null;
  background_image: Id | null;
}

export interface Deck {
  id: Id;
  game: Id;
  level: Id | null;
  status: string;
  name: string;
  slug: string;
  description: string | null;
  deck_type: string;
  minimum_players: number;
  maximum_players: number;
  active: boolean;
  sort: number | null;
  cover_image: Id | null;
}

export interface GameMode {
  id: Id;
  game: Id;
  status: string;
  name: string;
  slug: string;
  description: string | null;
  starting_level: Id | null;
  automatic_progression: boolean;
  cards_before_level_up: number;
  allow_manual_level_change: boolean;
  turn_mode: 'alternating' | 'random' | string;
  skip_limit: number;
  session_duration_minutes: number;
  repetition_policy: string;
  timer_policy: string;
  sort: number | null;
}

export interface ElementItem {
  id: Id;
  game: Id;
  status: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  safety_instructions: string | null;
  is_consumable: boolean;
  is_optional: boolean;
  sort: number | null;
  image: Id | null;
}

export interface Toy {
  id: Id;
  game: Id;
  status: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  intensity_min: number;
  difficulty: string;
  body_safe_notice: string | null;
  requires_cleaning: boolean;
  cleaning_instructions: string | null;
  requires_lubricant: boolean;
  sort: number | null;
  image: Id | null;
}

export interface Tag {
  id: Id;
  game: Id;
  status: string;
  name: string;
  slug: string;
  category: string;
  color: string | null;
  sort: number | null;
}

export interface Sex {
  id: Id;
  game: Id;
  status: string;
  name: string;
  slug: string;
  description: string | null;
  sort: number | null;
}

export interface Card {
  id: Id;
  game: Id;
  level: Id;
  status: string;
  sort: number | null;
  code: string;
  title: string | null;
  text: string;
  instructions: string | null;
  card_type: string;
  original_deck: string | null;
  duration_seconds: number | null;
  weight: number;
  intensity: number;
  minimum_players: number;
  maximum_players: number;
  performer: string;
  target: string;
  performer_sex: Id | null;
  target_sex: Id | null;
  allow_skip: boolean;
  requires_confirmation: boolean;
  safety_note: string | null;
  privacy_risk: number;
  physical_risk: number;
  gender_scope: string;
  language: string;
  contains_oral: boolean;
  contains_penetration: boolean;
  contains_anal: boolean;
  contains_restraint: boolean;
  contains_food: boolean;
  contains_temperature: boolean;
  contains_public_place: boolean;
  contains_third_parties: boolean;
  contains_photo: boolean;
  contains_video: boolean;
  contains_nudity: boolean;
  contains_roleplay: boolean;
  contains_toy: boolean;
  contains_manual_stimulation: boolean;
  contains_explicit_language: boolean;
  requires_device: boolean;
  requires_private_space: boolean;
  gm_escalation_score: number;
  gm_energy_score: number;
  gm_intimacy_score: number;
  gm_humor_score: number;
  gm_recovery_score: number;
  gm_novelty_score: number;
  gm_continuity_group: string | null;
  gm_scene_role: 'starter' | 'bridge' | 'continuation' | 'climax' | 'recovery' | 'closer' | string;
}

export interface DeckCard {
  id: Id;
  deck: Id;
  card: Id;
  sort: number | null;
  enabled: boolean;
}

export interface CardElement {
  id: Id;
  card: Id;
  element: Id;
  requirement: 'required' | 'optional' | 'alternative' | string;
  quantity: number;
  preparation_note: string | null;
  sort: number | null;
}

export interface CardToy {
  id: Id;
  card: Id;
  toy: Id;
  requirement: 'required' | 'optional' | 'alternative' | string;
  quantity: number;
  preparation_note: string | null;
  sort: number | null;
}

export interface CardTag {
  id: Id;
  card: Id;
  tag: Id;
  sort: number | null;
}

export interface AppSettings {
  id: Id;
  game: Id;
  status: string;
  default_mode: Id | null;
  default_level: Id | null;
  start_screen_title: string;
  intro_text: string;
  instructions_text: string;
  safety_text: string;
  stop_word: string;
  age_gate_enabled: boolean;
  show_timer: boolean;
  allow_screen_wake_lock: boolean;
  allow_fullscreen: boolean;
  allow_vibration: boolean;
  allow_offline: boolean;
  maximum_cards_per_session: number;
  enable_random_level: boolean;
  enable_private_filters: boolean;
  analytics_enabled: boolean;
  maintenance_mode: boolean;
  default_exclude_photo_video: boolean;
  default_exclude_third_parties: boolean;
  default_exclude_public_places: boolean;
  default_exclude_restraint: boolean;
  setup_step_1_label: string;
  setup_step_1_title: string;
  setup_step_1_subtitle: string;
  setup_step_2_label: string;
  setup_step_2_title: string;
  setup_step_2_subtitle: string;
  setup_step_3_label: string;
  setup_step_3_title: string;
  setup_step_3_subtitle: string;
  setup_step_4_label: string;
  setup_step_4_title: string;
  setup_step_4_subtitle: string;
  game_master_enabled: boolean;
  game_master_default_on: boolean;
  game_master_title: string;
  game_master_description: string;
  game_master_show_reactions: boolean;
}

export interface Release {
  id: Id;
  game: Id;
  status: string;
  version: string;
  published_at: string;
  changelog: string | null;
  minimum_app_version: string;
  config_hash: string | null;
}

export interface ContentBundle {
  game: Game;
  theme: Theme;
  levels: Level[];
  decks: Deck[];
  modes: GameMode[];
  elements: ElementItem[];
  toys: Toy[];
  tags: Tag[];
  sexes: Sex[];
  cards: Card[];
  deckCards: DeckCard[];
  cardElements: CardElement[];
  cardToys: CardToy[];
  cardTags: CardTag[];
  settings: AppSettings;
  release: Release;
  fetchedAt: string;
  contentHash?: string;
}

export interface SafetyFilters {
  excludePhotoVideo: boolean;
  excludeThirdParties: boolean;
  excludePublicPlaces: boolean;
  excludeRestraint: boolean;
  excludePenetration: boolean;
  excludeAnal: boolean;
  excludeOral: boolean;
  excludeNudity: boolean;
  excludeExplicitLanguage: boolean;
  excludeFood: boolean;
  excludeTemperature: boolean;
  excludeRoleplay: boolean;
  excludeManualStimulation: boolean;
  excludeToys: boolean;
  maxPrivacyRisk: number;
  maxPhysicalRisk: number;
}

export interface GameSetup {
  playerOne: string;
  playerTwo: string;
  playerOneSexId: Id | null;
  playerTwoSexId: Id | null;
  modeId: Id;
  levelIds: Id[];
  deckIds: Id[];
  elementIds: Id[];
  toyIds: Id[];
  filters: SafetyFilters;
  maxCards: number;
  intenseConsent: boolean;
  gameMasterEnabled: boolean;
}

export type GameMasterReaction = 'liked' | 'too_soft' | 'too_much' | 'repeat_style' | 'none';

export interface GameMasterEvent {
  id: string;
  cardId: Id;
  result: 'completed' | 'skipped';
  reaction: GameMasterReaction;
  playerIndex: 0 | 1;
  intensity: number;
  continuityGroup: string | null;
  sceneRole: string | null;
  createdAt: string;
}

export interface SessionState {
  id: string;
  startedAt: string;
  endedAt: string | null;
  currentCardId: Id | null;
  currentLevelId: Id | null;
  currentPlayer: 0 | 1;
  revealed: boolean;
  usedCardIds: Id[];
  completedCardIds: Id[];
  skippedCardIds: Id[];
  resolvedCount: number;
  timerStartedAt: string | null;
  timerRemaining: number | null;
  gmPhase: string;
  gmTension: number;
  gmEnergy: number;
  gmHostMessage: string | null;
  gmStrategy: string | null;
  gmReaction: GameMasterReaction;
  gmEvents: GameMasterEvent[];
  gmFallbackUsed: boolean;
  gmProvider: 'openai' | 'adaptive_fallback' | 'frontend_fallback' | null;
  gmModel: string | null;
  gmLatencyMs: number | null;
}

export interface EligibilityContext {
  selectedLevelIds: Set<Id>;
  selectedDeckIds: Set<Id>;
  selectedElementIds: Set<Id>;
  selectedToyIds: Set<Id>;
  filters: SafetyFilters;
  currentPlayerSexId?: Id | null;
  partnerSexId?: Id | null;
}
