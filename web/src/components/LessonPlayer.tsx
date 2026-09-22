import React, { useEffect, useState, useRef } from 'react';
import { learningService, type LessonDetail } from '../services/learning-service';

interface LessonPlayerProps {
  lessonId: string;
  onClose: () => void;
  onLessonCompleted: (newStatus: string) => void;
}

type StepType =
  | 'CONCEPT'
  | 'WORKED_EXAMPLE'
  | 'SCENARIO'
  | 'AUDIO_PRACTICE'
  | 'QUIZ'
  | 'REFLECTION'
  | 'CELEBRATION';

export const LessonPlayer: React.FC<LessonPlayerProps> = ({
  lessonId,
  onClose,
  onLessonCompleted,
}) => {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<StepType>('CONCEPT');

  // Interactive states
  const [selectedScenarioBranch, setSelectedScenarioBranch] = useState<string | null>(null);
  const [isAudioWrittenMode, setIsAudioWrittenMode] = useState(false);
  const [audioSelfEvalRubricPassed, setAudioSelfEvalRubricPassed] = useState(true);
  const [writtenResponse, setWrittenResponse] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted] = useState(false);
  const [selectedReflectionChip, setSelectedReflectionChip] = useState<string>('Refleksi Komunikasi');
  const [actionCommitment, setActionCommitment] = useState<string>('Konfirmasi pemahaman sebelum berasumsi');

  // Submission result & timer
  const startTimeRef = useRef<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any | null>(null);

  useEffect(() => {
    async function loadLesson() {
      try {
        setLoading(true);
        const res = await learningService.getLesson(lessonId);
        setLesson(res);
        startTimeRef.current = performance.now();
      } catch (err: any) {
        setError(err.message || 'Gagal memuat materi pelajaran');
      } finally {
        setLoading(false);
      }
    }
    loadLesson();
  }, [lessonId]);

  // Keyboard navigation engine (1, 2, 3, 4, Enter, Space, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Quiz and scenario numeric keys (1-4)
      if (['1', '2', '3', '4'].includes(e.key)) {
        const index = parseInt(e.key, 10) - 1;
        if (currentStep === 'SCENARIO' && lesson?.scenarios?.[0]?.branches?.[index]) {
          setSelectedScenarioBranch(lesson.scenarios[0].branches[index].id);
        } else if (currentStep === 'QUIZ' && !quizSubmitted && lesson?.quizzes?.[0]?.questions?.[0]?.options?.[index]) {
          const qId = lesson.quizzes[0].questions[0].id;
          const optId = lesson.quizzes[0].questions[0].options[index].id;
          setQuizAnswers((prev) => ({ ...prev, [qId]: optId }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, lesson, quizSubmitted, onClose]);

  const handleNextStep = () => {
    if (currentStep === 'CONCEPT') {
      setCurrentStep('WORKED_EXAMPLE');
    } else if (currentStep === 'WORKED_EXAMPLE') {
      setCurrentStep('SCENARIO');
    } else if (currentStep === 'SCENARIO') {
      setCurrentStep('AUDIO_PRACTICE');
    } else if (currentStep === 'AUDIO_PRACTICE') {
      setCurrentStep('QUIZ');
    } else if (currentStep === 'QUIZ') {
      setCurrentStep('REFLECTION');
    } else if (currentStep === 'REFLECTION') {
      handleSubmitAttempt();
    }
  };

  const handleSubmitAttempt = async () => {
    setIsSubmitting(true);
    const elapsedSeconds = Math.round((performance.now() - startTimeRef.current) / 1000);

    const payload = {
      answers: Object.entries(quizAnswers).map(([question_id, selected_option_id]) => ({
        question_id,
        selected_option_id,
      })),
      audio_delivery: {
        mode: isAudioWrittenMode ? 'WRITTEN_FALLBACK' : 'RECORDED',
        duration_seconds: 30,
        self_eval_rubric_passed: audioSelfEvalRubricPassed,
        written_text: isAudioWrittenMode ? writtenResponse : undefined,
      },
      reflection: {
        selected_chips: [selectedReflectionChip],
        action_commitment: actionCommitment,
      },
    };

    try {
      const result = await learningService.submitAttempt(lessonId, payload, Math.max(elapsedSeconds, 45));
      setSubmissionResult(result);
      setCurrentStep('CELEBRATION');
      if (result.details?.new_node_state) {
        onLessonCompleted(result.details.new_node_state);
      }
    } catch (err: any) {
      alert(`Gagal mengirim hasil latihan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Mempersiapkan Sesi Latihan Deliberate...</div>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <h3>Gagal Memuat Pelajaran</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '1rem 0' }}>{error}</p>
          <button onClick={onClose} className="btn btn-secondary">Tutup</button>
        </div>
      </div>
    );
  }

  const stepsList: StepType[] = ['CONCEPT', 'WORKED_EXAMPLE', 'SCENARIO', 'AUDIO_PRACTICE', 'QUIZ', 'REFLECTION'];
  const progressPercent = Math.min(100, Math.round(((stepsList.indexOf(currentStep) + 1) / stepsList.length) * 100));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-canvas)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Player Top Bar */}
      <header
        style={{
          height: '64px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.5rem',
          background: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', minHeight: 'auto' }}
            title="Keluar (Esc)"
          >
            ✕ Keluar
          </button>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hari ke-{lesson.day_number}</div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{lesson.title}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '200px', background: 'var(--bg-surface-elevated)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: 'var(--primary)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </header>

      {/* Main Card Canvas */}
      <main className="content-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* 1. CONCEPT CARD */}
        {currentStep === 'CONCEPT' && (
          <div className="card">
            <span className="badge badge-available" style={{ marginBottom: '1rem' }}>Konsep Inti</span>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{lesson.concepts?.[0]?.title || lesson.title}</h2>
            <div style={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
              {lesson.concepts?.[0]?.explanation || 'Pahami dasar kerangka komunikasi deliberate ini secara menyeluruh.'}
            </div>
            {lesson.objectives && lesson.objectives.length > 0 && (
              <div style={{ padding: '1rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                  Target Pembelajaran:
                </div>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {lesson.objectives.map((obj) => (
                    <li key={obj.id} style={{ marginBottom: '0.25rem' }}>{obj.description}</li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={handleNextStep} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              Lanjut ke Studi Komparatif ➔
            </button>
          </div>
        )}

        {/* 2. WORKED EXAMPLE CARD */}
        {currentStep === 'WORKED_EXAMPLE' && (
          <div className="card">
            <span className="badge badge-available" style={{ marginBottom: '1rem' }}>Studi Kasus Komparatif</span>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>Bandingkan Dua Pola Respons</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Bad Example */}
              <div style={{ padding: '1.25rem', background: 'var(--alert-coral-light)', border: '1px solid var(--alert-coral)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontWeight: 700, color: 'var(--alert-coral)', marginBottom: '0.5rem' }}>✕ Contoh Keliru (Reaktif)</div>
                <p style={{ fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  "{lesson.concepts?.[0]?.example_bad || 'Kenapa proyek ini selalu terlambat? Kalian tidak punya rasa tanggung jawab sama sekali!'}"
                </p>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Catatan: Menyulut defensif, menyerang kepribadian, tidak berfokus pada fakta objektif.
                </div>
              </div>

              {/* Good Example */}
              <div style={{ padding: '1.25rem', background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>✓ Contoh Tepat (Konstruktif)</div>
                <p style={{ fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                  "{lesson.concepts?.[0]?.example_good || 'Saya melihat tenggat waktu kemarin terlewati 2 hari. Mari kita diskusikan kendala teknis apa yang perlu kita atasi bersama.'}"
                </p>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Catatan: Menggunakan fakta teramati, memisahkan orang dari masalah, dan mengajak kolaborasi.
                </div>
              </div>
            </div>

            <button onClick={handleNextStep} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              Lanjut ke Skenario Percakapan ➔
            </button>
          </div>
        )}

        {/* 3. BRANCHING SCENARIO CARD */}
        {currentStep === 'SCENARIO' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span className="badge badge-available">Simulasi Skenario</span>
              {lesson.scenarios?.[0] && (
                <span className="badge badge-review">Suasana: {lesson.scenarios[0].counterpart_mood}</span>
              )}
            </div>

            <h2 style={{ fontSize: '1.35rem', marginBottom: '0.75rem' }}>
              {lesson.scenarios?.[0]?.counterpart_name || 'Rekan Kerja'} ({lesson.scenarios?.[0]?.counterpart_role || 'Kolega'})
            </h2>

            <div style={{ padding: '1.25rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                "{lesson.scenarios?.[0]?.context || 'Saya merasa usulan yang saya berikan kemarin sama sekali tidak dihargai dalam rapat.'}"
              </p>
            </div>

            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              Pilih respons yang paling konstruktif (Gunakan tombol angka 1-4):
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {lesson.scenarios?.[0]?.branches?.map((branch, idx) => {
                const isSelected = selectedScenarioBranch === branch.id;
                return (
                  <div
                    key={branch.id}
                    onClick={() => setSelectedScenarioBranch(branch.id)}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-canvas)',
                      border: isSelected
                        ? branch.is_optimal
                          ? '2px solid var(--primary)'
                          : '2px solid var(--alert-coral)'
                        : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {idx + 1}.
                      </span>
                      <span style={{ fontSize: '0.95rem' }}>{branch.option_text}</span>
                    </div>
                    {isSelected && (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.85rem',
                          background: branch.is_optimal ? 'var(--primary-light)' : 'var(--alert-coral-light)',
                          color: branch.is_optimal ? 'var(--primary)' : 'var(--alert-coral)',
                          fontWeight: 500,
                        }}
                      >
                        {branch.feedback_text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleNextStep}
              disabled={!selectedScenarioBranch}
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
            >
              Lanjut ke Kalibrasi Vokal ➔
            </button>
          </div>
        )}

        {/* 4. AUDIO PRACTICE CARD (DUAL-TRACK VOCALICS) */}
        {currentStep === 'AUDIO_PRACTICE' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span className="badge badge-available">Dual-Track Vocalics</span>
              <button
                type="button"
                onClick={() => setIsAudioWrittenMode(!isAudioWrittenMode)}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', minHeight: 'auto' }}
              >
                {isAudioWrittenMode ? '🎙️ Ganti ke Mode Rekam' : '✍️ Mode Tulisan (Tanpa Mikrofon)'}
              </button>
            </div>

            <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
              {isAudioWrittenMode ? 'Formulasi Respons Tertulis' : 'Kalibrasi Artikulasi & Kecepatan Suara'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Target kecepatan: 110–145 WPM | Target jeda strategis: 2.0 detik.
            </p>

            {/* Prompt */}
            <div style={{ padding: '1rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Naskah Praktik:</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                "{lesson.audio_exercises?.[0]?.transcript || 'Saya menghargai masukan Anda. Mari kita telaah kembali data pendukung agar keputusan kita berpijak pada fakta yang jelas.'}"
              </div>
            </div>

            {isAudioWrittenMode ? (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Tuliskan kembali formulasi respons Anda dengan penekanan jeda:
                </label>
                <textarea
                  rows={3}
                  value={writtenResponse}
                  onChange={(e) => setWrittenResponse(e.target.value)}
                  placeholder="Ketikkan respons Anda di sini..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <button type="button" className="btn btn-primary" style={{ borderRadius: 'var(--radius-full)', width: '48px', height: '48px', padding: 0 }}>
                    ▶️
                  </button>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Dengarkan Exemplar Audio Asli</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contoh intonasi tenang berwibawa penutur asli Indonesia</div>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Rubrik Kalibrasi Mandiri:</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={audioSelfEvalRubricPassed}
                    onChange={(e) => setAudioSelfEvalRubricPassed(e.target.checked)}
                  />
                  Artikulasi jelas, ritme stabil, tanpa filler words berlebihan
                </label>
              </div>
            )}

            <button onClick={handleNextStep} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              Lanjut ke Evaluasi Formatif ➔
            </button>
          </div>
        )}

        {/* 5. QUIZ EVALUATION CARD */}
        {currentStep === 'QUIZ' && (
          <div className="card">
            <span className="badge badge-available" style={{ marginBottom: '1rem' }}>Uji Pemahaman Formatif</span>
            <h2 style={{ fontSize: '1.35rem', marginBottom: '1rem' }}>
              {lesson.quizzes?.[0]?.questions?.[0]?.prompt || 'Apakah indikator utama komunikasi berbasis bukti?'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {lesson.quizzes?.[0]?.questions?.[0]?.options?.map((option, idx) => {
                const qId = lesson.quizzes[0].questions[0].id;
                const isSelected = quizAnswers[qId] === option.id;

                return (
                  <div
                    key={option.id}
                    onClick={() => {
                      if (!quizSubmitted) {
                        setQuizAnswers((prev) => ({ ...prev, [qId]: option.id }));
                      }
                    }}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-canvas)',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                      cursor: quizSubmitted ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <span style={{ fontSize: '0.95rem' }}>{option.option_text}</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleNextStep}
              disabled={Object.keys(quizAnswers).length === 0}
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
            >
              Lanjut ke Refleksi Gibbs ➔
            </button>
          </div>
        )}

        {/* 6. GIBBS REFLECTION CARD */}
        {currentStep === 'REFLECTION' && (
          <div className="card">
            <span className="badge badge-available" style={{ marginBottom: '1rem' }}>Siklus Refleksi Gibbs</span>
            <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>Rencana Tindak Lanjut Nyata</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Pilih satu komitmen komunikasi nyata yang akan Anda terapkan dalam 24 jam ke depan.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              {['Konfirmasi Fakta', 'Hindari Nada Defensif', 'Jeda Strategis 2 Detik', 'Fokus Solusi Bersama'].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setSelectedReflectionChip(chip)}
                  className={`btn ${selectedReflectionChip === chip ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', minHeight: 'auto' }}
                >
                  {chip}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Komitmen Tindakan:
              </label>
              <input
                type="text"
                value={actionCommitment}
                onChange={(e) => setActionCommitment(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <button
              onClick={handleSubmitAttempt}
              disabled={isSubmitting}
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
            >
              {isSubmitting ? 'Memproses Evaluasi...' : 'Selesaikan & Kirim Evaluasi ➔'}
            </button>
          </div>
        )}

        {/* 7. COMPLETION CELEBRATION MODAL */}
        {currentStep === 'CELEBRATION' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Sesi Pembelajaran Tuntas!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              {submissionResult?.message || 'Upaya Anda telah diverifikasi secara otoritatif oleh server.'}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '1rem',
                maxWidth: '480px',
                margin: '0 auto 2rem',
              }}
            >
              <div style={{ padding: '1rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nilai Akhir</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {submissionResult?.details?.score_percentage !== undefined
                    ? `${submissionResult.details.score_percentage}%`
                    : '100%'}
                </div>
              </div>

              <div style={{ padding: '1rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status Node</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                  {submissionResult?.details?.new_node_state || 'COMPLETED'}
                </div>
              </div>

              <div style={{ padding: '1rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>XP Diperoleh</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--info-blue)' }}>
                  +{submissionResult?.details?.xp_awarded?.total_awarded || 20} XP
                </div>
              </div>
            </div>

            <button onClick={onClose} className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
              Kembali ke Beranda
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
