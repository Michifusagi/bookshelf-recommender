import type { Shelf } from '../types';
import BookCard from './BookCard';
import styles from './Bookshelf.module.css';

interface BookshelfProps {
  shelves: Shelf[];
}

export default function Bookshelf({ shelves }: BookshelfProps) {
  if (shelves.length === 0) {
    return (
      <div className={styles.emptyShelf}>
        <p>No bookshelf could be assembled from the retrieved Open Library results.</p>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {shelves.map(shelf => (
        <section className={styles.shelf} key={shelf.name}>
          <div className={styles.shelfHeader}>
            <span className={styles.label}>{shelf.name}</span>
            <p>{shelf.description}</p>
          </div>
          <div className={styles.bookRail}>
            {shelf.books.map(book => (
              <BookCard book={book} key={`${shelf.name}-${book.candidateId}`} />
            ))}
          </div>
          <div className={styles.woodLine} />
        </section>
      ))}
    </div>
  );
}
