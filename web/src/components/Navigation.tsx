import React, { useEffect, useState } from 'react';
import { useAuth } from '../services/auth-context';
import { subscribePendingCount, syncPendingCommands } from '../services/offline-queue';

export type CurrentView = 'dashboard' | 'path' | 'review' | 'settings' | 'lesson';

interface NavigationProps {
  currentView: CurrentView;
  onNavigate: (view: CurrentView) => void;
  activeStreak?: number;
  bankedFreezes?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentView,
  onNavigate,
  activeStreak = 0,
  bankedFreezes = 0,
}) => {
  const { user, logout } = useAuth();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    return subscribePendingCount((count) => {
      setPendingSyncCount(count);
    });
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncPendingCommands();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      {/* Desktop Sidebar (260px fixed) */}
      <aside className="sidebar" aria-label="Navigasi Utama">
        {/* Brand Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                color: '#0F172A',
                fontSize: '1.2rem',
              }}
            >
              K
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', letterSpacing: '-0.02em' }}>KARSA</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Komunikasi Deliberate</div>
            </div>
          </div>

          {/* Gamification Quick Stats */}
          <div
            style={{
              marginTop: '1.25rem',
              padding: '0.75rem',
              background: 'var(--bg-canvas)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>🔥</span>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                  {activeStreak} Hari
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Streak Aktif</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.9rem' }}>❄️</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--info-blue)' }}>
                {bankedFreezes}/2
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
          <button
            onClick={() => onNavigate('dashboard')}
            className={`btn ${currentView === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}
          >
            <span>📊</span> Beranda
          </button>
          <button
            onClick={() => onNavigate('path')}
            className={`btn ${currentView === 'path' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}
          >
            <span>🗺️</span> Jalur 365 Hari
          </button>
          <button
            onClick={() => onNavigate('review')}
            className={`btn ${currentView === 'review' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}
          >
            <span>🧠</span> Spaced Retrieval
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className={`btn ${currentView === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }}
          >
            <span>⚙️</span> Pengaturan & Akun
          </button>
        </nav>

        {/* Offline Sync State Pill */}
        {pendingSyncCount > 0 && (
          <div
            style={{
              margin: '0.75rem',
              padding: '0.75rem',
              background: 'var(--accent-gold-light)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-gold)',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>
              ⚠️ {pendingSyncCount} Perintah Tertunda
            </div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Tersimpan lokal di IndexedDB.
            </div>
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="btn btn-gold"
              style={{ width: '100%', padding: '0.4rem', fontSize: '0.75rem', minHeight: 'auto' }}
            >
              {isSyncing ? 'Sinkronisasi...' : 'Sinkronkan Sekarang'}
            </button>
          </div>
        )}

        {/* User Mini Profile & Logout */}
        <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {user?.displayName || user?.email}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.timezone}</div>
            </div>
            <button
              onClick={logout}
              title="Keluar"
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', minHeight: 'auto' }}
            >
              Keluar
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (5 tabs) */}
      <nav className="bottom-nav" aria-label="Navigasi Mobile">
        <button
          onClick={() => onNavigate('dashboard')}
          style={{
            background: 'none',
            border: 'none',
            color: currentView === 'dashboard' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.2rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>📊</span>
          <span>Beranda</span>
        </button>
        <button
          onClick={() => onNavigate('path')}
          style={{
            background: 'none',
            border: 'none',
            color: currentView === 'path' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.2rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🗺️</span>
          <span>Jalur</span>
        </button>
        <button
          onClick={() => onNavigate('review')}
          style={{
            background: 'none',
            border: 'none',
            color: currentView === 'review' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.2rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🧠</span>
          <span>Review</span>
        </button>
        <button
          onClick={() => onNavigate('settings')}
          style={{
            background: 'none',
            border: 'none',
            color: currentView === 'settings' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.2rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>⚙️</span>
          <span>Akun</span>
        </button>
      </nav>
    </>
  );
};
