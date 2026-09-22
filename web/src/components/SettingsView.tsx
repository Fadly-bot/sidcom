import React, { useState } from 'react';
import { useAuth } from '../services/auth-context';
import { learningService } from '../services/learning-service';
import { apiClient } from '../services/api-client';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB — Asia/Jakarta (UTC+7)' },
  { value: 'Asia/Makassar', label: 'WITA — Asia/Makassar (UTC+8)' },
  { value: 'Asia/Jayapura', label: 'WIT — Asia/Jayapura (UTC+9)' },
  { value: 'Asia/Singapore', label: 'SGT — Asia/Singapore (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'JST — Asia/Tokyo (UTC+9)' },
  { value: 'Europe/London', label: 'GMT/BST — Europe/London' },
  { value: 'America/New_York', label: 'EST/EDT — America/New_York' },
  { value: 'UTC', label: 'UTC — Standar Internasional' },
];

export const SettingsView: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const [selectedTz, setSelectedTz] = useState(user?.timezone || 'Asia/Jakarta');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleUpdateTimezone = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setIsUpdating(true);

    try {
      await learningService.updateTimezone(selectedTz);
      await refreshProfile();
      setStatusMessage({
        type: 'success',
        text: 'Zona waktu berhasil diperbarui. Jadwal siklus harian telah disesuaikan.',
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Gagal memperbarui zona waktu (pembatasan 30 hari aktif).',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const data = await apiClient(`/api/v1/users/${user.id}/data`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `karsa-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Gagal mengekspor data: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="content-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Pengaturan & Profil Akun</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Kelola konfigurasi zona waktu otoritatif dan privasi data pembelajaran Anda.
        </p>
      </div>

      {statusMessage && (
        <div
          role="alert"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            background: statusMessage.type === 'success' ? 'var(--primary-light)' : 'var(--alert-coral-light)',
            border: `1px solid ${statusMessage.type === 'success' ? 'var(--primary)' : 'var(--alert-coral)'}`,
            color: statusMessage.type === 'success' ? 'var(--primary)' : 'var(--alert-coral)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Timezone Configuration Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Zona Waktu Server Otoritatif</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          Semua perhitungan streak, batas tengah malam, dan retensi spaced repetition dihitung secara ketat berdasarkan zona waktu yang terdaftar.
        </p>

        <form onSubmit={handleUpdateTimezone}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="tz-select" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Pilih Zona Waktu IANA:
            </label>
            <select
              id="tz-select"
              value={selectedTz}
              onChange={(e) => setSelectedTz(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '0.95rem',
              }}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              marginBottom: '1.25rem',
            }}
          >
            ⚠️ <strong>Aturan Anti-Spoofing:</strong> Zona waktu akun hanya dapat diubah maksimal 1 kali setiap 30 hari untuk mencegah manipulasi streak.
          </div>

          <button
            type="submit"
            disabled={isUpdating || selectedTz === user?.timezone}
            className="btn btn-primary"
          >
            {isUpdating ? 'Menyimpan...' : 'Simpan Perubahan Zona Waktu'}
          </button>
        </form>
      </div>

      {/* Privacy & Data Export Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Data Pembelajaran & Privasi</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          Sesuai prinsip transparansi data, Anda dapat mengunduh seluruh rekam jejak progres latihan, nilai, dan ledger XP Anda.
        </p>

        <button
          type="button"
          onClick={handleExportData}
          disabled={isExporting}
          className="btn btn-secondary"
        >
          {isExporting ? 'Mengekspor...' : '📦 Unduh Ekspor Data Lengkap (JSON)'}
        </button>
      </div>
    </div>
  );
};
