import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../media/commonsPhotos', () => ({
  searchFreePhotos: vi.fn(async () => [{
    title: 'Belem.jpg',
    imageUrl: 'https://upload.example/belem.jpg',
    thumbUrl: 'https://upload.example/thumb/belem.jpg',
    pageUrl: 'https://commons.example/File:Belem.jpg',
    author: 'Jane',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
  }]),
}));

import { PhotoPicker } from './PhotoPicker';

const empty = { photoUrl: null, photoCredit: null, photoLicense: null, photoLicenseUrl: null };

describe('PhotoPicker', () => {
  it('cherche des photos libres et enregistre l’auteur et la licence du choix', async () => {
    const onChange = vi.fn();
    render(<PhotoPicker placeName="Belém" value={empty} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Chercher' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Choisir la photo Belem.jpg' }));
    expect(onChange).toHaveBeenCalledWith({
      photoUrl: 'https://upload.example/thumb/belem.jpg',
      photoCredit: 'Jane (https://commons.example/File:Belem.jpg)',
      photoLicense: 'CC BY-SA 4.0',
      photoLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    });
  });

  it('retire la photo choisie', async () => {
    const onChange = vi.fn();
    render(<PhotoPicker placeName="Belém" onChange={onChange} value={{ photoUrl: 'https://x/y.jpg', photoCredit: 'Jane', photoLicense: 'CC0', photoLicenseUrl: null }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la photo' }));
    expect(onChange).toHaveBeenCalledWith(empty);
    await waitFor(() => expect(screen.getByText(/Photo :/)).toBeInTheDocument());
  });
});
