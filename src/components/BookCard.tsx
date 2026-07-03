import type { RecommendedBook } from '../types';
import styles from './BookCard.module.css';

interface BookCardProps {
  book: RecommendedBook;
}

export default function BookCard({ book }: BookCardProps) {
  const authorText = book.authors.length > 0 ? book.authors.join(', ') : 'Unknown author';

  return (
    <article className={styles.card}>
      <div className={styles.coverWrap}>
        {book.coverUrl ? (
          <img
            className={styles.cover}
            src={book.coverUrl}
            alt={`${book.title} cover`}
            loading="lazy"
          />
        ) : (
          <div className={styles.placeholderCover}>
            <span>{initials(book.title)}</span>
          </div>
        )}
      </div>
      <div className={styles.meta}>
        <div>
          <h4 className={styles.title}>{book.title}</h4>
          <p className={styles.author}>{authorText}</p>
          {book.firstPublishYear && (
            <p className={styles.year}>{book.firstPublishYear}</p>
          )}
        </div>
        <p className={styles.reason}>{book.reason}</p>
      </div>
    </article>
  );
}

function initials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join('');
}
