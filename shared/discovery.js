import { validateConstraints, GENRES } from "./conversation.js";
export const MOODS = [
  { id: "light", label: "Light", emoji: "😄", hint: "comedies & animation" },
  { id: "tense", label: "Tense", emoji: "😰", hint: "thrillers & crime" },
  {
    id: "mindbending",
    label: "Mind-bending",
    emoji: "🤯",
    hint: "sci-fi & mystery",
  },
  { id: "deep", label: "Deep", emoji: "🎭", hint: "drama & history" },
  { id: "epic", label: "Epic", emoji: "🌀", hint: "action & adventure" },
  { id: "romantic", label: "Romantic", emoji: "💑", hint: "romance films" },
  { id: "dark", label: "Dark", emoji: "😱", hint: "horror & thriller" },
  { id: "artsy", label: "Artsy", emoji: "🎨", hint: "drama & documentary" },
];

export const DECADES = [
  { id: "all", label: "All" },
  { id: "1920s", label: "1920s" },
  { id: "1930s", label: "1930s" },
  { id: "1940s", label: "1940s" },
  { id: "1950s", label: "1950s" },
  { id: "1960s", label: "1960s" },
  { id: "1970s", label: "1970s" },
  { id: "1980s", label: "1980s" },
  { id: "1990s", label: "1990s" },
  { id: "2000s", label: "2000s" },
  { id: "2010s", label: "2010s" },
  { id: "2020s", label: "2020s" },
];

export const COUNTRIES = [
  { code: "any", label: "Any country", flag: "🌍" },
  { code: "US", label: "American", flag: "🇺🇸" },
  { code: "GB", label: "British", flag: "🇬🇧" },
  { code: "FR", label: "French", flag: "🇫🇷" },
  { code: "IT", label: "Italian", flag: "🇮🇹" },
  { code: "DE", label: "German", flag: "🇩🇪" },
  { code: "ES", label: "Spanish", flag: "🇪🇸" },
  { code: "SE", label: "Scandinavian", flag: "🇸🇪" },
  { code: "JP", label: "Japanese", flag: "🇯🇵" },
  { code: "KR", label: "Korean", flag: "🇰🇷" },
  { code: "CN", label: "Chinese", flag: "🇨🇳" },
  { code: "HK", label: "HK", flag: "🇭🇰" },
  { code: "TW", label: "Taiwanese", flag: "🇹🇼" },
  { code: "IN", label: "Indian", flag: "🇮🇳" },
  { code: "IR", label: "Iranian", flag: "🇮🇷" },
  { code: "PL", label: "Polish", flag: "🇵🇱" },
  { code: "RU", label: "Russian", flag: "🇷🇺" },
  { code: "MX", label: "Mexican", flag: "🇲🇽" },
  { code: "AR", label: "Argentine", flag: "🇦🇷" },
  { code: "BR", label: "Brazilian", flag: "🇧🇷" },
  { code: "DK", label: "Danish", flag: "🇩🇰" },
  { code: "PT", label: "Portuguese", flag: "🇵🇹" },
  { code: "GR", label: "Greek", flag: "🇬🇷" },
  { code: "TR", label: "Turkish", flag: "🇹🇷" },
  { code: "PH", label: "Filipino", flag: "🇵🇭" },
  { code: "TH", label: "Thai", flag: "🇹🇭" },
];

export const MOOD_GENRES = {
  light: [35, 16],
  tense: [53, 80],
  mindbending: [878, 9648],
  deep: [18, 99, 36],
  epic: [28, 12, 14],
  romantic: [10749],
  dark: [27, 53],
  artsy: [18, 99],
};
export const DEFAULT_DISCOVERY = {
  genre_ids: [],
  mood: "",
  decade: "",
  country: "",
  director: null,
  actor: null,
  max_runtime: "",
};
export function discoveryConstraints(input = {}) {
  const positive = (v) =>
    Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
  const mood = Object.hasOwn(MOOD_GENRES, input.mood) ? input.mood : null;
  return {
    ...validateConstraints(input),
    genre_ids: Array.isArray(input.genre_ids)
      ? [...new Set(input.genre_ids.filter((g) => GENRES.includes(g)))]
      : [],
    ...(mood ? { genre_ids: MOOD_GENRES[mood] } : {}),
    decade: DECADES.some((d) => d.id === input.decade && d.id !== "all")
      ? Number(input.decade.slice(0, 4))
      : null,
    country: COUNTRIES.some((c) => c.code === input.country && c.code !== "any")
      ? input.country
      : null,
    director_id: positive(input.director_id),
    actor_id: positive(input.actor_id),
  };
}
export function matchesDiscovery(movie, filters) {
  if (filters.decade) {
    const year = Number(movie.release_date?.slice(0, 4));
    if (!year || year < filters.decade || year > filters.decade + 9)
      return false;
  }
  if (
    filters.country &&
    !movie.production_countries?.some((c) => c.iso_3166_1 === filters.country)
  )
    return false;
  if (
    filters.director_id &&
    !movie.credits?.crew?.some(
      (p) => p.id === filters.director_id && p.job === "Director",
    )
  )
    return false;
  if (
    filters.actor_id &&
    !movie.credits?.cast?.some((p) => p.id === filters.actor_id)
  )
    return false;
  return true;
}
