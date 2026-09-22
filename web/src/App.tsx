import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './services/auth-context';
import { Navigation, type CurrentView } from './components/Navigation';
import { AuthView } from './components/AuthView';
import { Dashboard } from './components/Dashboard';
import { PathView } from './components/PathView';
import { LessonPlayer } from './components/LessonPlayer';
import { ReviewPlayer } from './components/ReviewPlayer';
import { SettingsView } from './components/SettingsView';
import { learningService, type DashboardData } from './services/learning-service';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<CurrentView>('dashboard');
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshDashboardStats = async () => {
    try {
      const res = await learningService.getDashboard();
      setDashboardData(res);
    } catch {
      // Ignore when offline
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshDashboardStats();
    }
  }, [isAuthenticated, currentView]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '1.25rem' }}>Memuat Sesi Karsa...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthView />;
  }

  return (
    <div className="app-layout">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--accent-gold)',
            color: '#0F172A',
            padding: '0.4rem 1rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 700,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          📶 Mode Offline Aktif — Upaya latihan disimpan aman di IndexedDB dan akan disinkronkan otomatis saat terhubung kembali.
        </div>
      )}

      {/* Navigation Shell */}
      <Navigation
        currentView={currentView}
        onNavigate={(view) => {
          setIsReviewOpen(false);
          setActiveLessonId(null);
          setCurrentView(view);
        }}
        activeStreak={dashboardData?.active_streak}
        bankedFreezes={dashboardData?.banked_freezes}
      />

      {/* Main Content Area */}
      <div className="main-content" style={{ marginTop: !isOnline ? '32px' : 0 }}>
        {isReviewOpen || currentView === 'review' ? (
          <ReviewPlayer
            onClose={() => {
              setIsReviewOpen(false);
              if (currentView === 'review') setCurrentView('dashboard');
              refreshDashboardStats();
            }}
            onSessionCompleted={() => {
              refreshDashboardStats();
            }}
          />
        ) : currentView === 'dashboard' ? (
          <Dashboard
            onStartLesson={(lessonId) => setActiveLessonId(lessonId)}
            onStartReview={() => setIsReviewOpen(true)}
            onNavigatePath={() => setCurrentView('path')}
          />
        ) : currentView === 'path' ? (
          <PathView onSelectLesson={(lessonId) => setActiveLessonId(lessonId)} />
        ) : currentView === 'settings' ? (
          <SettingsView />
        ) : null}
      </div>

      {/* Distraction-free Lesson Player Modal */}
      {activeLessonId && (
        <LessonPlayer
          lessonId={activeLessonId}
          onClose={() => {
            setActiveLessonId(null);
            refreshDashboardStats();
          }}
          onLessonCompleted={() => {
            refreshDashboardStats();
          }}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;
