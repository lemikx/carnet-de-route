import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom ne fournit pas Blob.text() : équivalent minimal pour les tests d'import de fichier.
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
