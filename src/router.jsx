import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import App from './App.jsx';

const RegistrationPage = lazy(() => import('./components/RegistrationPage.jsx'));

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/register',
    element: (
      <Suspense fallback={<RegistrationLoading />}>
        <RegistrationPage />
      </Suspense>
    ),
  },
]);

function RegistrationLoading() {
  return (
    <main className="registration-loading" aria-hidden="true">
      <span className="registration-spinner" aria-label="Loading registration" />
    </main>
  );
}

export { router, RegistrationPage };
