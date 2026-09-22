import React, { useState } from 'react';
import { useAuth } from '../services/auth-context';

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isRegister) {
        if (!displayName.trim()) {
          throw new Error('Nama lengkap wajib diisi');
        }
        await register(email, password, displayName);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal melakukan autentikasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.08) 0%, transparent 60%), var(--bg-canvas)',
      }}
    >
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '2.5rem' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 1rem',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              color: '#0F172A',
              fontSize: '1.5rem',
              boxShadow: 'var(--shadow-glow-emerald)',
            }}
          >
            K
          </div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>KARSA</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Platform Deliberate Practice Komunikasi Berbasis Bukti
          </p>
        </div>

        {/* Tab Toggle */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-canvas)',
            borderRadius: 'var(--radius-md)',
            padding: '0.25rem',
            marginBottom: '1.5rem',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => { setIsRegister(false); setErrorMessage(null); }}
            style={{
              flex: 1,
              padding: '0.6rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              background: !isRegister ? 'var(--bg-surface)' : 'transparent',
              color: !isRegister ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setErrorMessage(null); }}
            style={{
              flex: 1,
              padding: '0.6rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              background: isRegister ? 'var(--bg-surface)' : 'transparent',
              color: isRegister ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Daftar Baru
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--alert-coral-light)',
              border: '1px solid var(--alert-coral)',
              color: 'var(--alert-coral)',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isRegister && (
            <div>
              <label
                htmlFor="displayName"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}
              >
                Nama Lengkap
              </label>
              <input
                id="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Contoh: Fadly"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}
            >
              Alamat Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}
            >
              Kata Sandi
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{ marginTop: '0.5rem', width: '100%' }}
          >
            {isSubmitting ? 'Memproses...' : isRegister ? 'Buat Akun Karsa' : 'Masuk ke Platform'}
          </button>
        </form>
      </div>
    </div>
  );
};
