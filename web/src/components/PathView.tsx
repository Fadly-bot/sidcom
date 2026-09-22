import React, { useEffect, useState } from 'react';
import { learningService, type PathData, type PathNode } from '../services/learning-service';

interface PathViewProps {
  onSelectLesson: (lessonId: string) => void;
}

export const PathView: React.FC<PathViewProps> = ({ onSelectLesson }) => {
  const [pathData, setPathData] = useState<PathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<number>(1);

  useEffect(() => {
    async function loadPath() {
      try {
        setLoading(true);
        const res = await learningService.getPath();
        setPathData(res);
      } catch (err: any) {
        setError(err.message || 'Gagal memuat jalur pembelajaran');
      } finally {
        setLoading(false);
      }
    }
    loadPath();
  }, []);

  if (loading) {
    return (
      <div className="content-container" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>Memuat Jalur Kurikulum 365 Hari...</div>
      </div>
    );
  }

  if (error || !pathData) {
    return (
      <div className="content-container">
        <div className="card" style={{ borderLeft: '4px solid var(--alert-coral)' }}>
          <h3>Terjadi Kesalahan</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{error || 'Data kurikulum tidak ditemukan'}</p>
        </div>
      </div>
    );
  }

  const phaseNodes = pathData.nodes.filter((n) => n.phase_number === selectedPhase);

  const getBadgeClass = (state: PathNode['state']) => {
    switch (state) {
      case 'MASTERED': return 'badge-mastered';
      case 'COMPLETED': return 'badge-completed';
      case 'AVAILABLE': return 'badge-available';
      case 'REVIEW_REQUIRED': return 'badge-review';
      default: return 'badge-locked';
    }
  };

  const getStatusLabel = (state: PathNode['state']) => {
    switch (state) {
      case 'MASTERED': return 'Dikuasai 👑';
      case 'COMPLETED': return 'Selesai ✓';
      case 'AVAILABLE': return 'Tersedia 🔓';
      case 'REVIEW_REQUIRED': return 'Perlu Ulang ⚠️';
      default: return 'Terkunci 🔒';
    }
  };

  return (
    <div className="content-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Peta Jalur 365 Hari</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            12 Fase Kurikulum deliberate practice dari fondasi intrapersonal hingga kepemimpinan visioner.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Kemajuan Total</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>
              {pathData.completed_count + pathData.mastered_count} / {pathData.total_lessons} Hari
            </div>
          </div>
        </div>
      </div>

      {/* Phase Selector Tabs (1 to 12) */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.75rem',
          marginBottom: '2rem',
          scrollbarWidth: 'thin',
        }}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((phaseNum) => (
          <button
            key={phaseNum}
            onClick={() => setSelectedPhase(phaseNum)}
            className={`btn ${selectedPhase === phaseNum ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
              minHeight: 'auto',
            }}
          >
            Fase {phaseNum} {phaseNum === 12 ? '(35 Hari)' : '(30 Hari)'}
          </button>
        ))}
      </div>

      {/* Node Grid for Selected Phase */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {phaseNodes.map((node) => {
          const isClickable = node.state !== 'LOCKED';

          return (
            <div
              key={node.lesson_id}
              onClick={() => isClickable && onSelectLesson(node.lesson_id)}
              className={`card ${isClickable ? 'card-interactive' : ''}`}
              style={{
                opacity: node.state === 'LOCKED' ? 0.6 : 1,
                cursor: isClickable ? 'pointer' : 'not-allowed',
                borderLeft:
                  node.state === 'MASTERED'
                    ? '4px solid var(--accent-gold)'
                    : node.state === 'COMPLETED'
                    ? '4px solid var(--primary)'
                    : node.state === 'AVAILABLE'
                    ? '4px solid var(--info-blue)'
                    : '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Hari ke-{node.day_number} (M{node.week_number})
                </span>
                <span className={`badge ${getBadgeClass(node.state)}`}>
                  {getStatusLabel(node.state)}
                </span>
              </div>

              <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                {node.title}
              </h3>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Tipe: {node.lesson_type}</span>
                {node.score !== undefined && (
                  <span style={{ fontWeight: 700, color: node.score >= 80 ? 'var(--primary)' : 'var(--alert-coral)' }}>
                    Nilai: {node.score}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
