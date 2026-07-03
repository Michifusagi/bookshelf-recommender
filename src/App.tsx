import { FormEvent, useState } from 'react';
import { createRecommendation } from './api';
import RecommendationResult from './components/RecommendationResult';
import type { RecommendationResponse } from './types';
import styles from './App.module.css';

const SAMPLE_PROMPTS = [
  'I want to learn physics.',
  'I want to read a mystery novel with a bright and uplifting atmosphere.',
  'I want to become someone who understands robotics and physical AI.',
  'I want books that would be on the bookshelf of my ideal future self.',
];

export default function App() {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userPrompt = prompt.trim();
    if (!userPrompt || loading) return;

    setLoading(true);
    setError(null);

    try {
      const nextResult = await createRecommendation(userPrompt);
      setResult(nextResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong while building your bookshelf.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Open Library + AI Agent</span>
          <h1>Future Bookshelf</h1>
          <p>
            Describe what you want to learn, feel, explore, or become. The agent searches
            Open Library for real books, reasons over the candidates, and arranges a
            bookshelf built around your goal.
          </p>
        </div>

        <form className={styles.promptPanel} onSubmit={handleSubmit}>
          <label htmlFor="book-prompt">What should your next shelf help you do?</label>
          <textarea
            id="book-prompt"
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            placeholder="Tell the agent about a topic, mood, genre, or future version of yourself."
            rows={5}
          />

          <div className={styles.sampleGrid} aria-label="Sample prompts">
            {SAMPLE_PROMPTS.map(sample => (
              <button
                key={sample}
                type="button"
                onClick={() => setPrompt(sample)}
                className={prompt === sample ? styles.activeChip : styles.chip}
              >
                {sample}
              </button>
            ))}
          </div>

          <button className={styles.generateButton} type="submit" disabled={loading || !prompt.trim()}>
            {loading ? 'Building your bookshelf...' : 'Generate bookshelf'}
          </button>
        </form>
      </section>

      <section className={styles.agentNote}>
        <div>
          <strong>Agent flow</strong>
          <span>Interpret intent</span>
          <span>Create searches</span>
          <span>Fetch real books</span>
          <span>Organize shelves</span>
        </div>
        <p>Final recommendations are validated against the retrieved Open Library candidate list.</p>
      </section>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {loading && (
        <section className={styles.loadingShelf} aria-live="polite">
          <div />
          <div />
          <div />
          <p>Searching Open Library and asking the agent to arrange the best matches.</p>
        </section>
      )}

      {result && !loading && <RecommendationResult result={result} />}
    </main>
  );
}
