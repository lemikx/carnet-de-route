import { describeAuthError } from './authError';

describe('describeAuthError', () => {
  it('explique la limite d’envoi d’e-mails', () => {
    expect(describeAuthError({ message: 'email rate limit exceeded', status: 429 })).toContain('Trop de demandes');
  });
  it('explique une adresse de redirection refusée', () => {
    expect(describeAuthError({ message: 'redirect_to is not allowed' })).toContain('adresse de retour');
  });
  it('explique un problème de réseau', () => {
    expect(describeAuthError(new TypeError('Failed to fetch'))).toContain('connexion');
  });
  it('affiche le message d’origine pour les autres erreurs', () => {
    expect(describeAuthError({ message: 'Signups not allowed for otp', status: 422 })).toContain('Signups not allowed for otp');
  });
});
