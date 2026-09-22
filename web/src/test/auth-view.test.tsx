import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthView } from '../components/AuthView';
import { AuthProvider } from '../services/auth-context';

describe('AuthView Component', () => {
  it('renders login form by default', () => {
    render(
      <AuthProvider>
        <AuthView />
      </AuthProvider>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('KARSA');
    expect(screen.getByLabelText(/Alamat Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Kata Sandi/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Masuk ke Platform/i })).toBeInTheDocument();
  });

  it('switches to registration form on tab click', () => {
    render(
      <AuthProvider>
        <AuthView />
      </AuthProvider>
    );

    const registerTab = screen.getByRole('button', { name: /Daftar Baru/i });
    fireEvent.click(registerTab);

    expect(screen.getByLabelText(/Nama Lengkap/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buat Akun Karsa/i })).toBeInTheDocument();
  });

  it('validates required fields and shows error alert on failed login', async () => {
    // Mock global fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi salah' }),
    } as Response);

    render(
      <AuthProvider>
        <AuthView />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/Alamat Email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/Kata Sandi/i), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /Masuk ke Platform/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email atau kata sandi salah');
    });
  });
});
