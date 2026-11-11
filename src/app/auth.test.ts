import { resolveUser } from './auth';

describe('resolveUser', () => {
  it('utilise la session active', () => {
    expect(resolveUser('a@b.fr', { online: true, lastEmail: null, networkError: false })).toEqual({ email: 'a@b.fr' });
  });
  it('garde le dernier utilisateur hors ligne quand la session a expiré', () => {
    expect(resolveUser(null, { online: false, lastEmail: 'a@b.fr', networkError: false })).toEqual({ email: 'a@b.fr', offlineOnly: true });
  });
  it('garde le dernier utilisateur si le renouvellement échoue faute de réseau', () => {
    expect(resolveUser(null, { online: true, lastEmail: 'a@b.fr', networkError: true })).toEqual({ email: 'a@b.fr', offlineOnly: true });
  });
  it('demande une connexion en ligne sans session', () => {
    expect(resolveUser(null, { online: true, lastEmail: 'a@b.fr', networkError: false })).toBeNull();
  });
  it('demande une connexion si personne ne s’est jamais connecté', () => {
    expect(resolveUser(null, { online: false, lastEmail: null, networkError: false })).toBeNull();
  });
});
