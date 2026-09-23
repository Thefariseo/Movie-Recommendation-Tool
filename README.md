# Umbrify

A film discovery app built with React 18, Vite and Tailwind. Guest mode remains available; account mode adds a lightweight Vercel Functions backend and Supabase Auth/Postgres.

## What this change implements

| Area | Implementation | Activation requirement |
| --- | --- | --- |
| Accounts | Email signup/sign-in, confirmation, recovery, password changes, Google OAuth with PKCE; sessions in HttpOnly cookies | Supabase project, auth URLs, optional Google provider |
| Cross-device library | Watched films, integer ratings 1–10, watchlist and profile in Postgres; 30-second/focus refresh; version conflicts and deletion tombstones | Apply the database migration and configure server variables |
| Guest migration | Explicit import into the signed-in account; existing cloud records, including deletions, take precedence | No additional service |
| Community | Profile search, follows, mutual-friend activity, shared editable watchlists, group film selection for you and up to three friends | Users opt into discovery/activity sharing |
| Collaborative recommendations | Pearson neighbours with overlap shrinkage; at least three common ratings and two supporting neighbours per candidate | A sufficient overlap of real, consenting users' ratings |
| Learned model | Seeded, biased matrix factorization; held-out RMSE compared with a per-user mean baseline; private artifacts; Edge inference | Run the trainer on real ratings after the validation thresholds are met |
| Streaming | User-selected country, existing TMDB watch-provider endpoint, JustWatch attribution and TMDB watch links | TMDB key |
| Trakt | OAuth connection, encrypted server-side tokens, refresh/revocation, paginated import and explicit export | Register a Trakt application and configure encryption key |
| Letterboxd | Existing ZIP/CSV import plus export of watched/ratings and watchlist CSVs accepted by Letterboxd | User imports/exports files; no automatic login or API sync |
| Conversation | Private saved sessions, persistent preferences, refreshed picks, thematic marathons, Italian/English guided interpretation; optional Responses Structured Outputs | Supabase + TMDB; optional OpenAI API key and model |

These are code paths, not proof that the remote services have been provisioned. This implementation does not create a Supabase project, deploy the SQL, configure OAuth providers, train on production users, or publish a production deployment by itself.

## Recommendation ranking update

Local and account recommendations now learn genre and decade preferences from both high and low ratings. Unrated history is excluded from preference learning. Sparse evidence is shrunk toward neutral, and TMDB scores are weighted by vote count. Curated labels are a small tie-breaker rather than the main ranking signal.

Account picks blend content, neighbour evidence and available trained predictions instead of replacing content with a single source. Group discovery draws candidate genres from every member; the existing least-misery group score and watched-film exclusions remain. Diverse seed selection and final reranking reduce near-identical picks. **Other picks** de-prioritises recently displayed titles without emptying a narrowly filtered result set. Genre and runtime controls apply to every candidate source, including watchlists; explicit constraints are never relaxed to fill the list.

These changes are covered by deterministic ranking and mocked provider regression tests. They are not a measured improvement on real-user satisfaction: that requires feedback and a larger consenting evaluation cohort. The existing model-training quality gate remains unchanged.

## Local development

Requires Node 22+.

```bash
npm ci
cp .env.example .env
# Fill in the values described below.
npm run dev:api
# In a second terminal:
npm run dev
```

Vite serves `http://localhost:5173` and proxies `/api` to the local Node server on port 3001. Alternatively use `vercel dev` with the same handlers and adjust `APP_URL` to that origin. Account features display an unavailable state until configuration is present; existing guest browsing still uses `VITE_TMDB_KEY`.

## Database and authentication setup

1. Create a Supabase project. Apply every file in `supabase/migrations/` in filename order, using the SQL editor or your normal migration process. The migration adds `profiles`, per-film libraries, follows, shared lists, chat sessions, rate limits, encrypted integration storage and private model storage. It also backfills profiles for any existing auth users. Apply each migration once.
   `202609210001_oauth_profile_names.sql` derives the profile name from whichever claim the provider sent (`display_name`, `full_name`, `name`, `given_name`, then the email local part). Google never sends `display_name`, so without this migration every Google member is created as "Film lover"; it also re-derives existing profiles still sitting on that default.
2. Set the Supabase Auth Site URL to your deployed `APP_URL`.
3. Add these redirect URLs to Supabase Auth's allow list, using the real origin:
   - `https://YOUR-DOMAIN/auth/callback` for email confirmation and recovery.
   - `https://YOUR-DOMAIN/api/auth?action=callback&state=*` for Google PKCE (the query state is random). Supabase uses glob matching: verify the actual callback URL is allowed. For a dedicated trusted origin, `https://YOUR-DOMAIN/**` is an alternative; do not allow arbitrary origins.
   - Equivalent localhost URLs for development only.
4. Keep email confirmation enabled. Configure your production SMTP sender and auth rate limits in Supabase. The standard email templates must use Supabase's confirmation URL so it redirects to `/auth/callback`; customized templates must preserve that flow.
5. For Google, register a web OAuth client in Google Cloud. Its authorized redirect URI is `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. Put its client ID/secret in Supabase's Google provider and set `GOOGLE_AUTH_ENABLED=true` on Vercel. No Google secret belongs in the frontend. Redeploy after changing the variable: Vercel applies environment changes only to new deployments. Until then the button stays hidden rather than failing.

The API verifies access tokens with Supabase Auth before reading data. Browser requests to Vercel use same-origin cookies; mutations also require an exact `Origin` match and `X-Umbrify-Request`. Tokens are not returned by session/login API responses. Email confirmation tokens pass transiently through the standard callback fragment, are removed from the URL immediately, and are exchanged for HttpOnly cookies. Google uses a server-held PKCE verifier and single-use state cookie.

### Environment variables

| Variable | Where used | Required for |
| --- | --- | --- |
| `APP_URL` | Server | Exact browser origin, with HTTPS in production; cookie and CSRF handling |
| `SUPABASE_URL` | Server | Accounts and database |
| `SUPABASE_ANON_KEY` | Server | Supabase Auth and RLS-scoped database requests |
| `SUPABASE_SERVICE_ROLE_KEY` | Server/training process only | Trakt token storage and trained-model access/publication |
| `VITE_TMDB_KEY` | Browser-visible | Existing film search and guest recommendations |
| `TMDB_KEY` | Server | New recommendation/chat endpoints; falls back to existing `VITE_TMDB_KEY` |
| `OMDB_KEY` | Server | IMDb ratings and Rotten Tomatoes scores, the quality reference for display and ranking. Cached per film in `film_ratings` under a daily cap of 900 lookups; `VITE_OMDB_KEY` is still read as a fallback but is no longer sent to the browser |
| `GOOGLE_AUTH_ENABLED` | Server | Enable the Google button after provider setup |
| `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET` | Server | Trakt OAuth |
| `INTEGRATION_ENCRYPTION_KEY` | Server | AES-256-GCM encryption for Trakt token pairs |
| `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL` | Server | Optional natural-language preference extraction |

Never prefix service-role, encryption or provider secrets with `VITE_`. No production secret should be committed. Generate an integration encryption key once, store it securely, and keep it stable across deployments:

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'
```

Set environment variables separately for Vercel Preview and Production. Each preview origin must have a matching `APP_URL` and allow-listed auth callback. The SPA rewrite excludes `/api`, and account responses use `private, no-store`.

## Library consistency and sharing

- Guest data stays in the existing `watched` and `watchlist` browser keys. Signing in never silently uploads those keys to another person's account.
- Account data is kept in memory, not a shared localStorage catalogue. Switching accounts remounts the library tree. Signing out removes the account view. Account-bound request headers prevent a stale tab from writing into an account that was switched in another tab.
- Library mutations are serialized in the browser and use server-side compare-and-swap versions per film/list. Concurrent stale writes return 409 and refresh the affected client instead of silently winning. Different films can be changed independently.
- Deletions remain as tombstones. Imports use insert-if-absent semantics and cannot overwrite newer cloud ratings or resurrect deleted films. A deliberate “add” after deletion can recreate the film with the current version.
- Imports commit in batches of 500. Retrying after a partial failure is safe. The guest copy is removed only after every batch is confirmed. Account edits require a connection; failed writes are reported rather than silently being marked saved. This is not an offline mutation queue.
- Row-level security protects every table. Catalogue writes are restricted to the versioned function. Search requires discoverability; library visibility additionally requires mutual following and activity sharing. Shared lists are accessible only to their members. Members can leave; owners can delete a list.
- The activity page shows the latest library changes, not a permanent historical event log. Shared list membership is an explicit sharing decision and persists until leaving/deleting the list, even if the follow relationship later changes.

## Collaborative and learned recommendations

The existing content engine remains available. Signed-in users also receive a community-powered section. The SQL collaborative function calculates positive Pearson correlations over shared ratings, shrinks small overlaps, and pools candidate ratings across at least two neighbours. It exposes no peer identities or raw rating rows.

The trainer (`scripts/train-model.mjs`) uses only ratings from profiles with `collaborative=true`. It needs at least 10 consenting users, 100 ratings and 20 supported held-out ratings. The split is per user; held-out values are never part of the evaluation fit. A model is published only when it beats the per-user mean RMSE baseline. A final fit then uses all eligible ratings. This is an explicit-feedback matrix-factorization implementation, not a two-tower network.

```bash
npm run train
```

Run this from a trusted machine or a scheduled training worker with server credentials. Training is intentionally not performed inside an Edge request. Artifacts are stored privately in Postgres, capped at 10 MB, and scored by `api/recommend.js` on Vercel Edge. The trainer is capped at 100,000 ratings; migrate to a batch worker/vector store when the dataset grows. No production model or empirical quality improvement is claimed until real-data training and validation pass.

Withdrawing learning consent or removing contributed ratings invalidates saved models. Publication checks a consent epoch in a transaction, preventing a training job from reintroducing a model after a concurrent opt-out. The serving endpoint falls back to collaborative/content recommendations when no valid model exists. Retraining is an explicit operational step; no job is secretly scheduled by this change.

Group suggestions require each selected friend to allow library sharing and to have ratings. They exclude every participant's watched films and favor balanced scores (`60% minimum + 40% mean`) over a film one participant strongly dislikes.

## Taste space

Every recommendation path also places the member in a **taste space**: a 24-dimensional vector per film, learned offline with implicit ALS from MovieLens 32M (200,000 people, 32 million ratings; 16,012 films with at least 50 ratings, keyed by TMDB id). A rating counts as liking from 7/10 up, more so the higher it is. The member's vector is solved from their own loved films (and, more weakly, their watchlist) in a few milliseconds, so there is no training per member and nothing about them leaves Umbrify.

- `scripts/taste-space/train.py` rebuilds `public/models/taste-space.bin` (0.6 MB, int8 factors) from the dataset; the docstring has the steps.
- `shared/tasteSpace.js` parses it, places a member, scores every film and splits a film's score into one share per loved film, which is what the reason names (`Fans of "Ran" love it — you gave 5★`).
- The browser fetches the file lazily; Edge functions fetch it from `APP_URL`. Without it, picks carry on from the member's own evidence.
- Group picks rank the space by each film's weakest match among the members.

Offline, on 2,000 held-out MovieLens users who reveal 5, 10 or 20 random ratings, recall@20 of their hidden 4.5★+ films:

| Revealed ratings | Popularity | Genre + quality (like the old ranking) | Taste space |
|---|---|---|---|
| 5 | 0.253 | 0.117 | **0.285** |
| 10 | 0.251 | 0.116 | **0.324** |
| 20 | 0.249 | 0.113 | **0.347** |

MovieLens is licensed for non-commercial research use and requires acknowledgement: F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets: History and Context. ACM TiiS 5, 4, Article 19. GroupLens does not endorse Umbrify. **Commercial use needs GroupLens' permission, or the space retrained on Umbrify's own consenting ratings.**

## Personal critic

`/critic` is a critic that has read the member's diary. Configure one of:

- **OpenAI:** `OPENAI_API_KEY` and `OPENAI_CRITIC_MODEL` (falling back to `OPENAI_CHAT_MODEL`), a model that supports Responses Structured Outputs. Reasoning runs at `low` effort with 2,000 tokens of headroom; set `OPENAI_CRITIC_REASONING` to another effort, or `off` for a model without the setting.
- **Any OpenAI-compatible Chat Completions provider:** `CRITIC_API_URL` (the base URL, e.g. `https://api.groq.com/openai/v1` or `https://api.mistral.ai/v1`), `CRITIC_API_KEY` and `CRITIC_MODEL`. JSON mode is used and the answer is fitted to the schema (`conform` in `server/llm.js`). Before choosing a free plan, check its terms: Google's unpaid Gemini tier may not serve users in the EEA, UK or Switzerland, and Mistral's free tier trains on data unless you opt out.

Without either, the page says the critic is unavailable and nothing else changes.

- **Grounding.** Each call sends a compact dossier (`server/critic.js`): the titles and stars of the member's most and least liked films, recent and saved titles, the directors, themes and languages their signed evidence favours or avoids, and, in conversation, the taste space's current picks. The instructions require every claim to cite the member's own films and forbid recommending a watched film; suggestions are resolved on TMDB and watched ones dropped server-side regardless. Member text is treated as data.
- **Memory.** Separate chats (`critic_threads`, last 40 messages each, with the posters each reply suggested), plus up to 12 notes about the member's taste and their portrait shared across chats (`critic_memory`), all under RLS. Chats can be started, reopened and deleted; "Forget" deletes everything.
- **Nothing seen twice.** The dossier lists every film the member has watched; if a reply still recommends one, the critic is asked once more (not counted against the member) and watched films never get a poster.
- **Interview.** A member with fewer than five ratings starts with an interview: one question at a time, with well-known films to rate in one tap, ending in a summary and first picks.
- **Portrait** (rewritten only when the diary changes) and **"What would my critic say?"** on any film, which also receives the taste space's fit as a hint.
- Each member may ask the critic 15 things a day (messages, portraits and verdicts alike) and 6 a minute (`critic-day`, `critic-minute`).

## Film signals: the critic and the recommender agree

`taste_signals` holds what a member said, or their critic said, about single films: *Not for me* (on recommendation cards and the film page), films the critic warned against in a chat, films it recommended, and its verdicts (`love` +2, `like` +1, `mixed` −1, `skip` −2). Every recommendation path reads them (`shared/signals.js`):

- a −2 from any source (dismissed, warned against, judged *skip*) keeps the film out, and in the browser the film also counts as a 3/10 for its director, cast and themes;
- other signals nudge the score, and the critic's recommendations join the candidates with "Your critic recommended it";
- verdicts are stored in `critic_verdicts` and shown again whenever the film is opened, at no cost; *Ask again* spends a new question.

**Rounds.** The first round is stable. Each *Refresh* / *Other picks* round leaves out the films just shown while enough others remain, and adds seeded Gumbel noise so close candidates trade places while clearly better films stay on top.

## Tonight

`/tonight` finds one film for tonight: a mood, the time available, the streaming services the member pays for in their region (TMDB/JustWatch availability, remembered in the browser), and a nudge away from genres watched in the last few days.

**With friends** it becomes a movie night: the host picks up to three mutual friends who share their activity, Umbrify builds group picks (the taste space ranks each film by its weakest match among them) filtered to the host's services, and everyone votes *No / Fine / Yes please* from their own phone at `/tonight/:id`, which refreshes every three seconds. The host decides.

**Fairness.** Decided nights are the group's history. For each member, the gap between the best vote they gave and their vote on the film that won is their compromise, newest nights weighing most (`shared/tonight.js`). Whoever compromised lately gets up to ×1.5 weight on the next ballot, and the page says so. Sessions and votes live in `tonight_sessions` and `tonight_votes` under RLS: only invited members see or vote, votes close at the decision, and the ballot cannot change after creation.

## Journeys and the taste map

`/library/journeys` draws the taste space as a map (t-SNE of the normalised film vectors, `scripts/taste-space/map.py` → `public/models/taste-map.bin` and `.json`, 0.1 MB) split into 48 regions named after their genres, decade and best-known films. The member's films sit on it, loved and disliked, with their centre and how many regions they have visited (month by month when the library has dates).

A **journey** (`shared/journeys.js`) leads from a loved film into a region the member has never visited but whose films point the same way as their taste (cosine to the member's vector, so popularity does not decide). Its six steps follow the straight line from home to the destination in the taste space, each the unseen film closest to that point, the last two inside the destination. For a Ghibli lover one runs Howl's Moving Castle → Grave of the Fireflies → Porco Rosso → Tekkonkinkreet → Persepolis → 3-Iron. Journeys can be followed; progress is the steps watched, and the next one is marked.

Tapping the map (or one of the "made for you" chips) opens a **region**: its best-known films, where it ranks among the 48 for the member, how many of its films they have seen and their six best bets in it. From there a journey can be planned to that region at a chosen length (4, 6 or 8 films). "Other destinations" offers journeys to regions not shown yet. Each step says which loved film it is near (`becauseOf`).

Journeys **re-route** (`reroute`): when a step is rated 4/10 or less, the steps after the latest watched one are planned again from the last step the member liked (or the journey's start), keeping away from the disliked film and still ending in the same region. It happens once per dislike, so the path does not shift with every film watched.

Followed journeys are kept on the account (`followed_journeys`, through `/api/signals?journeys=1` and the `save-journey` / `drop-journey` actions, at most 12), so every device shows the same ones; guests keep them in `localStorage`, and a guest's journeys move to the account on the first visit after signing in.

## The look of a film

Each film's colour and light (brightness, contrast, deep shadow, highlights, saturation, colourfulness, warm or cool) is measured in the browser from its main TMDB still and cached (`shared/visual.js`, `src/utils/visualStyle.js`). It shows as a palette and named looks on the film page ("Dark & moody · Cool tones", and which loved film it looks like), as **Your eye** on the stats page, and as an optional *look* filter in Tonight.

It never ranks. Offline (`scripts/visual-style/`), on 445 well-known films and 22,820 MovieLens ratings, predicting a rating from visually similar films the member rated did no better than their plain mean (RMSE 0.9484 against 0.9485). Stills say nothing reliable about editing or camera movement, so neither is claimed.

## Trakt, Letterboxd and streaming

Register this exact callback in your Trakt application:

```text
https://YOUR-DOMAIN/api/trakt?action=callback
```

Connection state is browser-bound, hashed, expires after ten minutes and is consumed once. Tokens stay AES-GCM encrypted in a service-only table. A database lock prevents parallel sync/refresh for an account. Imports fetch watched films, ratings and watchlist pages before writing; unsupported IDs are counted. Existing Umbrify values are preserved. Exports require an explicit action, add watchlist entries and update ratings; they do not mirror deletions or create repeated watched-history events. The sync is user-triggered, not an automatic background mirror. Large catalogues may need repeated attempts when a function/provider timeout interrupts later batches.

Letterboxd currently says new API access is unavailable for recommendation and LLM projects. This app therefore offers the supported file route; it does not scrape accounts or advertise an unavailable Letterboxd OAuth provider. Use the watched/ratings file on the Letterboxd import page and the watchlist file on the Letterboxd watchlist import screen. Letterboxd limits a file to 1 MB; split a larger catalogue into smaller files with the header repeated.

Streaming data is the existing, official JustWatch partnership feed available through TMDB, not an independent JustWatch partner API. Country preference syncs through the account profile. Use the supplied TMDB watch URL for deep links; availability can change.

## Conversational recommendations

Conversations are private, stored per account, limited to the last 40 messages, and editable with optimistic versions. They remember genre choices, excluded genres, runtime, gentler-film requests and marathon themes. Recommendations always come from fetched film data; the language model cannot invent links, access another account or choose arbitrary backend tools.

Without OpenAI configuration, guided Italian/English commands work (e.g. “una commedia sotto 100 minuti”, “troppo violento”, “altri film”, “ricomincia”). With configuration, the Responses API extracts validated structured preferences from the latest eight messages; it receives message text and preference state, not the community rating matrix. Provider storage is disabled with `store:false`. Provider errors fall back to guided mode, which is identified in the reply. “Less violent” relies on genre/description/keyword filtering and is not a certified content-safety rating.

Database limits allow 10 chat turns/minute and 100/day per account. Candidate and history sizes are bounded. Configure provider project spending limits to match the intended public launch.

## Verification

```bash
npm test
npm run build
# A fresh disposable PostgreSQL 16 database; never a real Supabase database:
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/umbrify_test npm run test:db
```

The database script refuses any database name other than `umbrify_test`. It creates a minimal Auth schema solely to exercise the migration against real PostgreSQL roles. Tests cover RLS isolation, version conflicts, deletion/import behavior, mutual-friend visibility, shared-list membership, conversation privacy, collaborative recommendations and consent invalidation. Unit/API tests cover authentication, CSRF, pagination, encrypted tokens, model holdout quality on synthetic data, conversational constraints and CSV export. GitHub Actions runs these checks and the production build on pull requests.

Before production, exercise actual Supabase email/Google redirects with two test accounts, change a rating from two devices, connect a Trakt test account, and test the deployed Edge endpoint. These checks require configured external services; mocked API tests do not establish live OAuth/provider behavior.

## Official integration references

- [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Trakt authentication](https://docs.trakt.tv/reference/auth)
- [Letterboxd API access restrictions](https://letterboxd.com/api-beta/)
- [Letterboxd CSV import format](https://letterboxd.com/about/importing-data/)
- [TMDB/JustWatch watch providers](https://developer.themoviedb.org/reference/movie-watch-providers)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
