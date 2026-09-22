import React, { useEffect, useState } from 'react';
import { learningService, type DashboardData } from '../services/learning-service';

interface DashboardProps {
  onStartLesson: (lessonId: string) => void;
  onStartReview: () => void;
  onNavigatePath: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onStartLesson,
  onStartReview,
  onNavigatePath,
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTier2Modal, setShowTier2Modal] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);

  useEffect(() => {
    let timer: any;
    async function loadDashboard() {
      try {
        setLoading(true);
        const res = await learningService.getDashboard();
        setData(res);
        setCountdownSeconds(res.local_day_remaining_seconds);

        // Check if Tier 2 prioritized modal should trigger
        if (res.review_debt_tier === 'TIER_2_PRIORITIZED_GATE') {
          setShowTier2Modal(true);
        }
      } catch (err: any) {
        setError(err.message || 'Gagal memuat ringkasan belajar');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  // Live countdown timer for local midnight window
  useEffect(() => {
    if (countdownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdownSeconds]);

  const formatCountdown = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="content-container" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>Memuat Dasbor Pembelajaran...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="content-container">
        <div className="card" style={{ borderLeft: '4px solid var(--alert-coral)' }}>
          <h3>Terjadi Kesalahan</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{error || 'Data tidak tersedia'}</p>
        </div>
      </div>
    );
  }

  const isHardLocked = data.review_debt_tier === 'TIER_3_HARD_LOCK';

  return (
    <div className="content-container">
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Pusat Latihan Harian</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Bangun penguasaan komunikasi deliberatif Anda hari demi hari melalui latihan berbasis bukti.
        </p>
      </div>

      {/* Spaced Review 3-Tier Alert System */}
      {data.review_debt_tier === 'TIER_1_SOFT_REMINDER' && (
        <div
          role="status"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--info-blue-light)',
            border: '1px solid var(--info-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>💡</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--info-blue)' }}>Pemberitahuan Review Spaced Retrieval</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Ada {data.due_reviews_count} kartu memori siap diulang untuk mempertahankan retensi optimal.
              </div>
            </div>
          </div>
          <button onClick={onStartReview} className="btn btn-secondary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
            Review Sekarang
          </button>
        </div>
      )}

      {isHardLocked && (
        <div
          role="alert"
          style={{
            marginBottom: '1.5rem',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--alert-coral-light)',
            border: '1px solid var(--alert-coral)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🔒</span>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--alert-coral)', fontSize: '1rem' }}>
                Kunci Progresi Aktif: Utang Review Menumpuk
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                Selesaikan minimal 1 sesi review (5–8 kartu) untuk membuka pelajaran baru. ({data.due_reviews_count} kartu tertunggak)
              </div>
            </div>
          </div>
          <button onClick={onStartReview} className="btn btn-danger" style={{ fontWeight: 700 }}>
            Buka Kunci Lewat Review
          </button>
        </div>
      )}

      {/* Grid: Mission Card + Streak/XP Rail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Today's Mission Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: isHardLocked ? 'var(--alert-coral)' : 'var(--primary)' }} />
          
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span className="badge badge-available">Misi Hari Ini</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>⏱️ {data.today_lesson?.duration_minutes || 6} Menit</span>
            </div>

            {data.today_lesson ? (
              <>
                <h2 style={{ fontSize: '1.35rem', marginBottom: '0.75rem' }}>{data.today_lesson.title}</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Latihan terstruktur meliputi konsep inti, studi komparatif, skenario percakapan interaktif, dan kalibrasi vokal.
                </p>
              </>
            ) : (
              <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                Semua pelajaran pada fase aktif telah diselesaikan!
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              onClick={() => data.today_lesson && onStartLesson(data.today_lesson.lesson_id)}
              disabled={isHardLocked || !data.today_lesson}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              {isHardLocked ? '🔒 Pelajaran Terkunci' : 'Mulai Latihan Hari Ini'}
            </button>
            <button onClick={onNavigatePath} className="btn btn-secondary" title="Lihat Peta Kurikulum">
              🗺️ Peta
            </button>
          </div>
        </div>

        {/* Daily Progression & Streak Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>Status Ketekunan Belajar</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Siklus harian server berbasis zona waktu lokal</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🔥</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-gold)' }}>{data.active_streak}</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Hari Beruntun</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Bekuan tersimpan: ❄️ {data.banked_freezes}/2
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Batas Tengah Malam</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                {formatCountdown(countdownSeconds)}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+15m masa tenggang</div>
            </div>
          </div>

          {/* Quick Review Entry */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Spaced Retrieval Antrean</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{data.due_reviews_count} kartu memori siap diuji</div>
            </div>
            <button onClick={onStartReview} className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}>
              Mulai Sesi
            </button>
          </div>
        </div>
      </div>

      {/* Tier 2 Prioritized Review Modal Gate */}
      {showTier2Modal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="tier2-title">
          <div className="modal-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.75rem' }}>⚠️</span>
              <h3 id="tier2-title" style={{ fontSize: '1.25rem' }}>Rekomendasi Review Memori</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Anda memiliki <strong>{data.due_reviews_count} kartu review</strong> yang telah jatuh tempo. Untuk menjaga retensi jangka panjang, kami sangat merekomendasikan menyelesaikan 1 sesi review (3–5 menit) sebelum materi baru.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowTier2Modal(false)}
                className="btn btn-secondary"
                style={{ fontSize: '0.875rem' }}
              >
                Lanjut ke Pelajaran
              </button>
              <button
                onClick={() => { setShowTier2Modal(false); onStartReview(); }}
                className="btn btn-primary"
                style={{ fontSize: '0.875rem' }}
              >
                Selesaikan 1 Sesi Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
