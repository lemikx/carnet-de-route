/** Point d'extension : aujourd'hui l'utilisateur colle la réponse lui-même (aucune clé d'API). */
export interface AiProvider {
  id: 'copy-paste';
  request(prompt: string): Promise<string>;
}

export const copyPasteProvider: AiProvider = {
  id: 'copy-paste',
  async request() {
    throw new Error('Le mode copier-coller n’appelle pas l’IA directement.');
  },
};
