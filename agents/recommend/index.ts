/**
 * Book recommendation agent — EdgeOne Makers
 *
 * File path agents/recommend/index.ts maps to POST /recommend.
 * This route keeps API keys server-side, retrieves real candidates from
 * Open Library, and asks the OpenAI-compatible gateway to organize only
 * those retrieved books into a structured bookshelf response.
 */

import OpenAI from 'openai';

const DEFAULT_MODEL = '@makers/deepseek-v4-flash';
const MAX_PROMPT_LENGTH = 1000;
const MAX_QUERIES = 5;
const MAX_CANDIDATES = 60;

type IntentType = 'learning' | 'entertainment' | 'future-self' | 'mixed';

interface BookCandidate {
  id: string;
  title: string;
  authors: string[];
  firstPublishYear?: number;
  openLibraryKey?: string;
  coverUrl?: string;
  subjects?: string[];
  source: 'open-library';
}

interface SearchPlan {
  goalSummary: string;
  intentType: IntentType;
  searchQueries: string[];
  shelfCategories: string[];
}

interface RecommendedBook {
  candidateId: string;
  title: string;
  authors: string[];
  firstPublishYear?: number;
  coverUrl?: string;
  reason: string;
  fitScore?: number;
}

interface Shelf {
  name: string;
  description: string;
  books: RecommendedBook[];
}

interface RecommendationResponse {
  interpretation: string;
  intentType: IntentType;
  strategyTitle: string;
  strategy: string[];
  shelves: Shelf[];
  ranking: RecommendedBook[];
  searchQueries: string[];
  candidateCount: number;
}

interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  key?: string;
  cover_i?: number;
  isbn?: string[];
  subject?: string[];
}

export async function onRequest(context: any) {
  try {
    const body = context.request.body ?? {};
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.trim() : '';

    if (!userPrompt) {
      return jsonResponse({ error: "'userPrompt' is required." }, 400);
    }

    if (userPrompt.length > MAX_PROMPT_LENGTH) {
      return jsonResponse({ error: `Please keep the prompt under ${MAX_PROMPT_LENGTH} characters.` }, 400);
    }

    const env = context.env as Record<string, string | undefined>;
    if (!env.AI_GATEWAY_API_KEY || !env.AI_GATEWAY_BASE_URL) {
      return jsonResponse(
        { error: 'AI gateway environment variables are missing. Set AI_GATEWAY_API_KEY and AI_GATEWAY_BASE_URL.' },
        500,
      );
    }

    const client = new OpenAI({
      apiKey: env.AI_GATEWAY_API_KEY,
      baseURL: env.AI_GATEWAY_BASE_URL,
    });
    const model = env.AI_GATEWAY_MODEL ?? DEFAULT_MODEL;

    const plan = await createSearchPlan(client, model, userPrompt);
    const candidates = await fetchCandidates(plan.searchQueries);

    if (candidates.length === 0) {
      return jsonResponse({
        interpretation: plan.goalSummary,
        intentType: plan.intentType,
        strategyTitle: 'Search Strategy',
        strategy: [
          'I created targeted Open Library searches from your prompt.',
          'Open Library did not return enough usable book records for this request.',
          'Try naming a subject, genre, author, or mood more directly.',
        ],
        shelves: [],
        ranking: [],
        searchQueries: plan.searchQueries,
        candidateCount: 0,
      } satisfies RecommendationResponse);
    }

    const recommendation = await organizeRecommendations(client, model, userPrompt, plan, candidates);
    const validated = validateRecommendation(recommendation, plan, candidates);
    return jsonResponse(validated);
  } catch (error) {
    console.error('[recommend] failed:', error);
    const message = error instanceof Error ? error.message : 'Recommendation service failed.';
    return jsonResponse({ error: message }, 500);
  }
}

async function createSearchPlan(client: OpenAI, model: string, userPrompt: string): Promise<SearchPlan> {
  const fallback = heuristicSearchPlan(userPrompt);

  const json = await completeJson(client, model, [
    {
      role: 'system',
      content:
        'You create Open Library search plans for a book recommendation agent. ' +
        'Return only valid JSON. Do not recommend books yet.',
    },
    {
      role: 'user',
      content:
        `User prompt: ${userPrompt}\n\n` +
        'Create JSON with: goalSummary, intentType, searchQueries, shelfCategories. ' +
        'intentType must be one of learning, entertainment, future-self, mixed. ' +
        'searchQueries should be concise Open Library queries, 3 to 5 items, no more than 6 words each. ' +
        'shelfCategories should match the intent. Use English only.',
    },
  ]);

  const parsed = json as Partial<SearchPlan>;
  const intentType = normalizeIntent(parsed.intentType) ?? fallback.intentType;
  const searchQueries = normalizeStringArray(parsed.searchQueries)
    .concat(fallback.searchQueries)
    .map(query => query.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return {
    goalSummary: stringOr(parsed.goalSummary, fallback.goalSummary),
    intentType,
    searchQueries: unique(searchQueries).slice(0, MAX_QUERIES),
    shelfCategories: unique(normalizeStringArray(parsed.shelfCategories).concat(fallback.shelfCategories)).slice(0, 5),
  };
}

async function organizeRecommendations(
  client: OpenAI,
  model: string,
  userPrompt: string,
  plan: SearchPlan,
  candidates: BookCandidate[],
): Promise<Partial<RecommendationResponse>> {
  const compactCandidates = candidates.map(book => ({
    id: book.id,
    title: book.title,
    authors: book.authors,
    firstPublishYear: book.firstPublishYear,
    subjects: book.subjects?.slice(0, 8) ?? [],
  }));

  return completeJson(client, model, [
    {
      role: 'system',
      content:
        'You are a careful AI book recommendation agent. Use only books from the supplied candidate list. ' +
        'Never invent titles, authors, years, or candidate IDs. Return only valid JSON in English.',
    },
    {
      role: 'user',
      content:
        `User prompt: ${userPrompt}\n\n` +
        `Search plan: ${JSON.stringify(plan)}\n\n` +
        `Candidate books: ${JSON.stringify(compactCandidates)}\n\n` +
        'Create JSON with these fields: interpretation, intentType, strategyTitle, strategy, shelves, ranking. ' +
        'Each shelf has name, description, books. Each book must include candidateId and reason, and may include fitScore 1-100. ' +
        'For learning prompts, use roadmap-like shelves such as Foundations, Core Concepts, Practice / Applications, Advanced or Future Direction. ' +
        'For entertainment prompts, use shelves such as Best Match, Light and Enjoyable, Deeper or More Classic, Hidden Gems. ' +
        'For future-self prompts, use shelves such as Foundations of the Future Self, Taste and Imagination, Professional Growth, Deep Curiosity. ' +
        'Rank the most important books in ranking. Use at most 12 total shelf books and at most 6 ranked books.',
    },
  ]);
}

async function completeJson(client: OpenAI, model: string, messages: Array<{ role: 'system' | 'user'; content: string }>) {
  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });
  const content = completion.choices[0]?.message?.content ?? '{}';
  return parseJsonObject(content);
}

async function fetchCandidates(queries: string[]): Promise<BookCandidate[]> {
  const all: BookCandidate[] = [];

  for (const query of queries.slice(0, MAX_QUERIES)) {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'future-bookshelf-agent/1.0',
      },
    });

    if (!response.ok) continue;
    const data = await response.json().catch(() => null) as { docs?: OpenLibraryDoc[] } | null;
    const docs = Array.isArray(data?.docs) ? data.docs : [];

    for (const doc of docs) {
      const candidate = normalizeOpenLibraryDoc(doc);
      if (candidate) all.push(candidate);
    }
  }

  return dedupeCandidates(all).slice(0, MAX_CANDIDATES);
}

function normalizeOpenLibraryDoc(doc: OpenLibraryDoc): BookCandidate | null {
  const title = doc.title?.trim();
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.map(author => author.trim()).filter(Boolean).slice(0, 3)
    : [];

  if (!title || authors.length === 0) return null;

  const isbn = Array.isArray(doc.isbn) ? doc.isbn.find(Boolean) : undefined;
  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
    : isbn
      ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`
      : undefined;

  return {
    id: makeCandidateId(title, authors),
    title,
    authors,
    firstPublishYear: doc.first_publish_year,
    openLibraryKey: doc.key,
    coverUrl,
    subjects: Array.isArray(doc.subject) ? doc.subject.slice(0, 12) : undefined,
    source: 'open-library',
  };
}

function dedupeCandidates(candidates: BookCandidate[]): BookCandidate[] {
  const seen = new Map<string, BookCandidate>();
  for (const candidate of candidates) {
    const key = makeCandidateId(candidate.title, candidate.authors);
    const existing = seen.get(key);
    if (!existing || (!existing.coverUrl && candidate.coverUrl)) {
      seen.set(key, { ...candidate, id: key });
    }
  }
  return Array.from(seen.values());
}

function validateRecommendation(
  raw: Partial<RecommendationResponse>,
  plan: SearchPlan,
  candidates: BookCandidate[],
): RecommendationResponse {
  const candidateMap = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const used = new Set<string>();

  const normalizeRecommendedBook = (book: Partial<RecommendedBook>): RecommendedBook | null => {
    if (!book || typeof book.candidateId !== 'string') return null;
    const candidate = candidateMap.get(book.candidateId);
    if (!candidate) return null;
    return {
      candidateId: candidate.id,
      title: candidate.title,
      authors: candidate.authors,
      firstPublishYear: candidate.firstPublishYear,
      coverUrl: candidate.coverUrl,
      reason: stringOr(book.reason, 'This retrieved Open Library candidate matches the search strategy.'),
      fitScore: typeof book.fitScore === 'number' ? Math.max(1, Math.min(100, Math.round(book.fitScore))) : undefined,
    };
  };

  const shelves = Array.isArray(raw.shelves)
    ? raw.shelves.map((shelf, index) => {
      const shelfBooks = Array.isArray(shelf?.books)
        ? shelf.books.map(normalizeRecommendedBook).filter((book): book is RecommendedBook => {
          if (!book || used.has(book.candidateId)) return false;
          used.add(book.candidateId);
          return true;
        })
        : [];
      return {
        name: stringOr(shelf?.name, plan.shelfCategories[index] ?? 'Recommended Shelf'),
        description: stringOr(shelf?.description, 'A focused group of books from Open Library results.'),
        books: shelfBooks,
      };
    }).filter(shelf => shelf.books.length > 0)
    : [];

  const fallbackShelves = shelves.length > 0 ? shelves : buildFallbackShelves(plan, candidates);
  const ranking = Array.isArray(raw.ranking)
    ? raw.ranking.map(normalizeRecommendedBook).filter((book): book is RecommendedBook => Boolean(book)).slice(0, 6)
    : [];

  return {
    interpretation: stringOr(raw.interpretation, plan.goalSummary),
    intentType: normalizeIntent(raw.intentType) ?? plan.intentType,
    strategyTitle: stringOr(raw.strategyTitle, strategyTitleFor(plan.intentType)),
    strategy: normalizeStringArray(raw.strategy).slice(0, 5).length > 0
      ? normalizeStringArray(raw.strategy).slice(0, 5)
      : defaultStrategy(plan),
    shelves: fallbackShelves,
    ranking: ranking.length > 0 ? ranking : fallbackShelves.flatMap(shelf => shelf.books).slice(0, 6),
    searchQueries: plan.searchQueries,
    candidateCount: candidates.length,
  };
}

function defaultStrategy(plan: SearchPlan): string[] {
  if (plan.intentType === 'learning') {
    return [
      'Start with accessible foundations before moving into technical depth.',
      'Use the middle shelves to connect concepts to examples and applications.',
      'Pick the ranking list as the shortest path into the subject.',
    ];
  }
  if (plan.intentType === 'entertainment') {
    return [
      'Prioritize mood and genre fit first.',
      'Balance easy reads with a few deeper or more classic options.',
      'Use the ranking list when you want the strongest first pick.',
    ];
  }
  if (plan.intentType === 'future-self') {
    return [
      'Build a shelf that reflects skills, taste, and long-term curiosity.',
      'Mix practical growth books with imagination-expanding books.',
      'Start with the titles that best define the future identity.',
    ];
  }
  return [
    'Translate the prompt into targeted Open Library searches.',
    'Group retrieved books by the role they can play on the shelf.',
    'Rank the strongest starting points from the validated candidate list.',
  ];
}

function buildFallbackShelves(plan: SearchPlan, candidates: BookCandidate[]): Shelf[] {
  const categories = plan.shelfCategories.length > 0 ? plan.shelfCategories : defaultShelves(plan.intentType);
  const books = candidates.slice(0, 12).map(candidate => ({
    candidateId: candidate.id,
    title: candidate.title,
    authors: candidate.authors,
    firstPublishYear: candidate.firstPublishYear,
    coverUrl: candidate.coverUrl,
    reason: 'This book was retrieved from Open Library for one of the generated search queries.',
  }));

  return categories.slice(0, 4).map((name, index) => ({
    name,
    description: 'Selected from real Open Library search results.',
    books: books.filter((_, bookIndex) => bookIndex % Math.min(categories.length, 4) === index),
  })).filter(shelf => shelf.books.length > 0);
}

function heuristicSearchPlan(userPrompt: string): SearchPlan {
  const lower = userPrompt.toLowerCase();
  const future = /\bfuture\b|\bideal\b|\bbecome\b|\bbookshelf\b|\bself\b/.test(lower);
  const entertainment = /\bmystery\b|\bnovel\b|\bfun\b|\buplifting\b|\bcozy\b|\bthriller\b|\bfantasy\b|\bromance\b/.test(lower);
  const learning = /\blearn\b|\bstudy\b|\bunderstand\b|\bphysics\b|\brobotics\b|\bscience\b|\bengineering\b/.test(lower);
  const intentType: IntentType = future ? 'future-self' : entertainment && !learning ? 'entertainment' : learning ? 'learning' : 'mixed';
  const cleaned = userPrompt.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const baseQuery = cleaned.split(' ').slice(0, 6).join(' ') || 'books';

  return {
    goalSummary: `The reader is looking for books related to: ${userPrompt}`,
    intentType,
    searchQueries: unique([
      baseQuery,
      learning ? `${baseQuery} introduction` : '',
      learning ? `${baseQuery} fundamentals` : '',
      entertainment ? `${baseQuery} fiction` : '',
      future ? `${baseQuery} future` : '',
      future ? `${baseQuery} creativity` : '',
    ].filter(Boolean)).slice(0, MAX_QUERIES),
    shelfCategories: defaultShelves(intentType),
  };
}

function defaultShelves(intentType: IntentType): string[] {
  if (intentType === 'entertainment') {
    return ['Best Match', 'Light and Enjoyable', 'Deeper or More Classic', 'Hidden Gems'];
  }
  if (intentType === 'future-self') {
    return ['Foundations of the Future Self', 'Taste and Imagination', 'Professional Growth', 'Deep Curiosity'];
  }
  if (intentType === 'learning') {
    return ['Foundations', 'Core Concepts', 'Practice / Applications', 'Advanced or Future Direction'];
  }
  return ['Best Starting Points', 'Core Shelf', 'Imagination Shelf', 'Next Directions'];
}

function strategyTitleFor(intentType: IntentType): string {
  if (intentType === 'entertainment') return 'Recommendation Strategy';
  if (intentType === 'future-self') return 'Future Self Bookshelf';
  if (intentType === 'learning') return 'Learning Roadmap';
  return 'Bookshelf Strategy';
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    const direct = JSON.parse(content);
    return direct && typeof direct === 'object' && !Array.isArray(direct) ? direct : {};
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : [];
}

function normalizeIntent(value: unknown): IntentType | undefined {
  return value === 'learning' || value === 'entertainment' || value === 'future-self' || value === 'mixed'
    ? value
    : undefined;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function makeCandidateId(title: string, authors: string[]): string {
  return `${normalizeKey(title)}__${normalizeKey(authors[0] ?? 'unknown')}`;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
