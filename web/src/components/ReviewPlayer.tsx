import React, { useEffect, useState, useRef } from 'react';
import { learningService, type ReviewCardItem } from '../services/learning-service';

interface ReviewPlayerProps {
  onClose: () => void;
  onSessionCompleted: () => void;
}

export const ReviewPlayer: React.FC<ReviewPlayerProps> = ({ onClose, onSessionCompleted }) => {
  const [queue, setQueue] = useState<ReviewCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [clearedCount, setClearedCount] = useState(0);

  const cardStartTimeRef = useRef<number>(0);

  useEffect(() => {
    async function loadQueue() {
      try {
        setLoading(true);
        const res = await learningService.getReviewQueue();
        setQueue(res.queue || []);
        cardStartTimeRef.current = performance.now();
      } catch (err: any) {
        setError(err.message || 'Gagal memuat antrean review');
      } finally {
        setLoading(false);
      }
    }
    loadQueue();
  }, []);

  const handleRateCard = async (rating: number) => {
    const currentCard = queue[currentIndex];
    if (!currentCard) return;

    const elapsedSeconds = Math.round((performance.now() - cardStartTimeRef.current) / 1000);

    try {
      await learningService.submitReview(currentCard.id, rating, Math.max(elapsedSeconds, 5));
      setClearedCount((prev) => prev + 1);
    } catch {
      // Offline fallback already handled in learningService
    }

    if (currentIndex + 1 < queue.length) {
      setCurrentIndex((prev) => prev + 1);
      setIsRevealed(false);
      cardStartTimeRef.current = performance.now();
    } else {
      setIsCompleted(true);
      onSessionCompleted();
    }
  };

  if (loading) {
    return (
      <div className="content-container" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>Mempersiapkan Sesi Spaced Retrieval...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content-container">
        <div className="card" style={{ borderLeft: '4px solid var(--alert-coral)' }}>
          <h3>Terjadi Kesalahan</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{error}</p>
          <button onClick={onClose} className="btn btn-secondary" style={{ marginTop: '1rem' }}>Kembali</button>
        </div>
      </div>
    );
  }

  if (queue.length === 0 || isCompleted) {
    return (
      <div className="content-container" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
            {clearedCount > 0 ? 'Sesi Review Selesai!' : 'Tidak Ada Kartu Tertunggak'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            {clearedCount > 0
              ? `Anda telah meninjau ${clearedCount} kartu memori secara aktif. Utang review telah berkurang dan materi tersimpan lebih kuat di memori jangka panjang.`
              : 'Semua kartu memori telah Anda kuasai dengan baik untuk siklus saat ini.'}
          </p>
          <button onClick={onClose} className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  const currentCard = queue[currentIndex];
  const progressPercent = Math.round(((currentIndex + 1) / queue.length) * 100);

  return (
    <div className="content-container" style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
          ✕ Selesai Nanti
        </button>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Kartu {currentIndex + 1} dari {queue.length}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ width: '100%', background: 'var(--bg-surface-elevated)', height: '6px', borderRadius: '3px', marginBottom: '2rem', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progressPercent}%`, background: 'var(--primary)', transition: 'width 0.3s ease' }} />
      </div>

      {/* Flashcard Component */}
      <div className="card" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <span className="badge badge-available" style={{ marginBottom: '1rem' }}>Stimulus Memori</span>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {currentCard.prompt}
          </h2>

          {isRevealed && (
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                background: 'var(--bg-canvas)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                Respons Model & Kata Kunci Inti:
              </div>
              <p style={{ color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1.6 }}>
                {currentCard.ideal_response || currentCard.back_content}
              </p>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ marginTop: '2rem' }}>
          {!isRevealed ? (
            <button
              onClick={() => setIsRevealed(true)}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.85rem' }}
            >
              Lihat Jawaban & Rubrik ➔
            </button>
          ) : (
            <div>
              <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Seberapa mudah Anda mengingat kembali informasi di atas?
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                <button
                  onClick={() => handleRateCard(1)}
                  className="btn btn-danger"
                  style={{ padding: '0.65rem 0.5rem', fontSize: '0.8rem' }}
                >
                  Lupa (1)
                </button>
                <button
                  onClick={() => handleRateCard(2)}
                  className="btn btn-secondary"
                  style={{ padding: '0.65rem 0.5rem', fontSize: '0.8rem' }}
                >
                  Sulit (2)
                </button>
                <button
                  onClick={() => handleRateCard(3)}
                  className="btn btn-primary"
                  style={{ padding: '0.65rem 0.5rem', fontSize: '0.8rem' }}
                >
                  Bagus (3)
                </button>
                <button
                  onClick={() => handleRateCard(4)}
                  className="btn btn-gold"
                  style={{ padding: '0.65rem 0.5rem', fontSize: '0.8rem' }}
                >
                  Mudah (4)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
