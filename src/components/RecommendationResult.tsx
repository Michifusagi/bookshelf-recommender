import type { RecommendationResponse } from '../types';
import Bookshelf from './Bookshelf';
import styles from './RecommendationResult.module.css';

interface RecommendationResultProps {
  result: RecommendationResponse;
}

export default function RecommendationResult({ result }: RecommendationResultProps) {
  return (
    <section className={styles.result}>
      <div className={styles.summaryGrid}>
        <div className={styles.panel}>
          <span className={styles.kicker}>Goal Interpretation</span>
          <p className={styles.interpretation}>{result.interpretation}</p>
        </div>
        <div className={styles.panel}>
          <span className={styles.kicker}>{result.strategyTitle}</span>
          <ul className={styles.strategyList}>
            {result.strategy.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <Bookshelf shelves={result.shelves} />

      {result.ranking.length > 0 && (
        <section className={styles.ranking}>
          <div>
            <span className={styles.kicker}>Start Here</span>
            <h3>Recommendation ranking</h3>
          </div>
          <ol>
            {result.ranking.map(book => (
              <li key={`rank-${book.candidateId}`}>
                <span>{book.title}</span>
                <small>{book.authors.join(', ')}</small>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className={styles.trace}>
        <span>Open Library searches</span>
        <div>
          {result.searchQueries.map(query => (
            <code key={query}>{query}</code>
          ))}
        </div>
        <small>{result.candidateCount} real candidate books considered</small>
      </div>
    </section>
  );
}
