import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhotoCredit, splitCredit } from './PhotoCredit';

describe('PhotoCredit', () => {
  it('sépare l’auteur et la page source', () => {
    expect(splitCredit('Jane (https://commons.example/File:Reykjavik.jpg)')).toEqual({ author: 'Jane', source: 'https://commons.example/File:Reykjavik.jpg' });
    expect(splitCredit('Jane')).toEqual({ author: 'Jane', source: null });
  });
  it('n’affiche pas l’adresse du fichier en clair', () => {
    render(<PhotoCredit credit="Jane (https://commons.example/File:Reykjavik.jpg)" license="CC0" />);
    expect(screen.getByRole('link', { name: 'Jane' })).toHaveAttribute('href', 'https://commons.example/File:Reykjavik.jpg');
    expect(screen.queryByText(/Reykjavik/)).toBeNull();
  });
});
