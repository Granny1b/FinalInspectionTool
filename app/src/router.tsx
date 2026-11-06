import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireRole } from './components/RequireRole';
import { RouteError } from './components/RouteError';
import { AdminOnly } from './features/insights/report/AdminOnly';
import { PrintShell } from './features/print/PrintShell';
import { InsightsPage } from './pages/InsightsPage';
import { InsightsReportPage } from './pages/InsightsReportPage';
import { InspectionNewPage } from './pages/InspectionNewPage';
import { InspectionPage } from './pages/InspectionPage';
import { InspectionPrintPage } from './pages/InspectionPrintPage';
import { InspectionsPage } from './pages/InspectionsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { QualityCheckPage } from './pages/QualityCheckPage';
import { QualityChecksPage } from './pages/QualityChecksPage';
import { SettingsPage } from './pages/SettingsPage';
import { StartQualityCheckPage } from './pages/StartQualityCheckPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { TemplatePrintPage } from './pages/TemplatePrintPage';
import { TemplateRevisionPage } from './pages/TemplateRevisionPage';
import { TemplatesPage } from './pages/TemplatesPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/inspections" replace /> },
      { path: 'inspections', element: <InspectionsPage /> },
      { path: 'inspections/new', element: <InspectionNewPage /> },
      { path: 'inspections/:id', element: <InspectionPage kind="final" /> },
      // The quality checks done on machines: inspections of kind quality, listed apart.
      { path: 'quality-checks', element: <InspectionsPage kind="quality" /> },
      { path: 'quality-checks/new', element: <StartQualityCheckPage /> },
      { path: 'quality-checks/:id', element: <InspectionPage kind="quality" /> },
      { path: 'templates', element: <TemplatesPage /> },
      // Admins get the editor, inspectors the latest published revision (decided in the page).
      { path: 'templates/:id', element: <TemplateEditorPage /> },
      { path: 'templates/:id/revisions/:revision', element: <TemplateRevisionPage /> },
      // A machine's quality checks: its Quality checks tab, one quality check, a revision of one.
      { path: 'templates/:id/quality-checks', element: <QualityChecksPage /> },
      { path: 'templates/:id/quality-checks/:qcId', element: <QualityCheckPage /> },
      {
        path: 'templates/:id/quality-checks/:qcId/revisions/:revision',
        element: <TemplateRevisionPage />,
      },
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
  // Print routes (brief §6): the preview without the sidebar, signed in like every other page.
  {
    element: <PrintShell />,
    errorElement: <RouteError />,
    children: [
      { path: 'inspections/:id/print', element: <InspectionPrintPage /> },
      // A quality check doesn't print yet: the page says so.
      { path: 'quality-checks/:id/print', element: <InspectionPrintPage /> },
      { path: 'templates/:id/print', element: <TemplatePrintPage /> },
      // The Insights report, admins only like Insights.
      {
        element: <AdminOnly />,
        children: [{ path: 'insights/report', element: <InsightsReportPage /> }],
      },
    ],
  },
]);
