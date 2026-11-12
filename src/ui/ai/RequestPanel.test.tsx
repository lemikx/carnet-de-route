import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ParseResult } from '../../ai/responseParser';
import { RequestPanel } from './RequestPanel';

function setup(result: ParseResult<unknown>, openUrl: string | null = null) {
  const onPaste = vi.fn(async () => result);
  const u = userEvent.setup();
  render(<RequestPanel kind="itinerary" prompt="LA DEMANDE" openUrl={openUrl} onPaste={onPaste} />);
  return { u, onPaste };
}
const paste = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.type(screen.getByLabelText('Réponse de Claude'), 'x');
  await u.click(screen.getByRole('button', { name: 'Analyser la réponse' }));
};

describe('RequestPanel', () => {
  it('copie la demande exacte et rappelle la recherche web', async () => {
    const { u } = setup({ ok: true, value: {}, warnings: [] });
    expect(screen.getByText(/recherche web/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Copier' }));
    expect(await navigator.clipboard.readText()).toBe('LA DEMANDE');
  });
  it('« Ouvrir dans Claude » seulement avec un lien', () => {
    setup({ ok: true, value: {}, warnings: [] });
    expect(screen.queryByRole('link', { name: 'Ouvrir dans Claude' })).toBeNull();
  });
  it('affiche le lien quand il existe', () => {
    setup({ ok: true, value: {}, warnings: [] }, 'https://claude.ai/new?q=x');
    expect(screen.getByRole('link', { name: 'Ouvrir dans Claude' })).toHaveAttribute('href', 'https://claude.ai/new?q=x');
  });
  it('réponse invalide : détail de l’erreur', async () => {
    const { u } = setup({ ok: false, errors: ['Jour 3, étape 2 : l’heure « 25:00 » est invalide.'], truncated: false });
    await paste(u);
    expect(await screen.findByText('Jour 3, étape 2 : l’heure « 25:00 » est invalide.')).toBeInTheDocument();
  });
  it('réponse tronquée : propose de continuer', async () => {
    const { u } = setup({ ok: false, errors: ['coupée'], truncated: true });
    await paste(u);
    expect(await screen.findByText(/continue exactement où tu t’es arrêté/)).toBeInTheDocument();
  });
  it('réponse valide : transmise', async () => {
    const { u, onPaste } = setup({ ok: true, value: {}, warnings: [] });
    await paste(u);
    expect(onPaste).toHaveBeenCalledWith('x');
  });
});
