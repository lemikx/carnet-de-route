import { createHashRouter } from 'react-router-dom';

function Accueil() {
  return (
    <main>
      <h1>Carnet de route</h1>
    </main>
  );
}

export const router = createHashRouter([{ path: '/', element: <Accueil /> }]);
