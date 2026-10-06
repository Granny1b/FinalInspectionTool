import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireRole } from './components/RequireRole';
import { RouteError } from './components/RouteError';
import { InsightsPage } from './pages/InsightsPage';
import { InspectionsPage } from './pages/InspectionsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';
import { TemplatesPage } from './pages/TemplatesPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/inspections" replace /> },
      { path: 'inspections', element: <InspectionsPage /> },
      { path: 'templates', element: <TemplatesPage /> },
      {
        element: <RequireRole role="admin" />,
        children: [
          { path: 'insights', element: <InsightsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
