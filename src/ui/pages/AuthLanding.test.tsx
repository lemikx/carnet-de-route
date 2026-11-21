import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import { AuthLanding, authErrorFromUrl } from './AuthLanding';

describe('authErrorFromUrl', () => {
  it('lien expiré', () => {
    expect(authErrorFromUrl('https://x/carnet-de-route/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toBe('Ce lien de connexion a expiré ou a déjà servi.');
  });
  it('autre erreur', () => {
    expect(authErrorFromUrl('https://x/?error=server_error&error_description=Boom#/')).toBe('Connexion impossible : Boom.');
  });
  it('jeton valide ou adresse normale : pas d’erreur', () => {
    expect(authErrorFromUrl('https://x/#access_token=abc&refresh_token=def')).toBeNull();
    expect(authErrorFromUrl('https://x/#/voyage/1')).toBeNull();
  });
});

describe('AuthLanding', () => {
  const show = () => render(
    <MemoryRouter initialEntries={['/access_token=abc']}>
      <TestAppProvider repo={createMemoryRepository()}>
        <Routes>
          <Route path="/" element={<p>Accueil</p>} />
          <Route path="/connexion" element={<p>Page connexion</p>} />
          <Route path="*" element={<AuthLanding />} />
        </Routes>
      </TestAppProvider>
    </MemoryRouter>,
  );
  afterEach(() => { window.location.hash = ''; });

  it('retour du lien valide : renvoie vers l’accueil au lieu d’une erreur 404', () => {
    window.location.hash = '#access_token=abc&refresh_token=def';
    show();
    expect(screen.getByText('Accueil')).toBeInTheDocument();
  });
  it('lien expiré : message clair et nouveau lien', () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired';
    show();
    expect(screen.getByRole('alert')).toHaveTextContent('Ce lien de connexion a expiré ou a déjà servi.');
    expect(screen.getByRole('link', { name: 'Recevoir un nouveau lien' })).toHaveAttribute('href', '/connexion');
  });
});
