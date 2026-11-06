import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireRole } from './components/RequireRole';
import { RouteError } from './components/RouteError';
import { AdminOnly } from './features/insights/report/AdminOnly';
import { ChecklistEditPage } from './pages/ChecklistEditPage';
import { PrintShell } from './features/print/PrintShell';
import { DeviationLogPage } from './pages/DeviationLogPage';
import { InsightsPage } from './pages/InsightsPage';
import { InsightsReportPage } from './pages/InsightsReportPage';
import { InspectionPage } from './pages/InspectionPage';
import { InspectionPrintPage } from './pages/InspectionPrintPage';
import { InspectionsPage } from './pages/InspectionsPage';
import { MachinePage } from './pages/MachinePage';
import { MachinesPage } from './pages/MachinesPage';
import { NewMachinePage } from './pages/NewMachinePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { QualityCheckPage } from './pages/QualityCheckPage';
import { QualityChecksPage } from './pages/QualityChecksPage';
import { SettingsPage } from './pages/SettingsPage';
import { StartCheckPage } from './pages/StartCheckPage';
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
      { index: true, element: <Navigate to="/machines" replace /> },
      // The machines being built, each with its own checks: where checks are started.
      { path: 'machines', element: <MachinesPage /> },
      { path: 'machines/new', element: <NewMachinePage /> },
      { path: 'machines/:id', element: <MachinePage /> },
      { path: 'inspections', element: <InspectionsPage /> },
      // A check is started on a machine: pick the machine, then its check.
      { path: 'inspections/new', element: <StartCheckPage key="final" kind="final" /> },
      { path: 'inspections/:id', element: <InspectionPage kind="final" /> },
      // A machine's check's own checklist (admins; the page says so to others).
      { path: 'inspections/:id/checklist', element: <ChecklistEditPage kind="final" /> },
      // The quality checks done on machines: inspections of kind quality, listed apart.
      { path: 'quality-checks', element: <InspectionsPage kind="quality" /> },
      { path: 'quality-checks/new', element: <StartCheckPage key="quality" kind="quality" /> },
      { path: 'quality-checks/:id', element: <InspectionPage kind="quality" /> },
      { path: 'quality-checks/:id/checklist', element: <ChecklistEditPage kind="quality" /> },
      // The deviation log of each kind, for everyone; keyed, so switching starts afresh.
      { path: 'deviations', element: <Navigate to="/deviations/final" replace /> },
      { path: 'deviations/final', element: <DeviationLogPage key="final" kind="final" /> },
      { path: 'deviations/quality', element: <DeviationLogPage key="quality" kind="quality" /> },
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
      { path: 'inspections/:id/print', element: <InspectionPrintPage kind="final" /> },
      // A quality check's report: entire, or only its deviations.
      { path: 'quality-checks/:id/print', element: <InspectionPrintPage kind="quality" /> },
      { path: 'templates/:id/print', element: <TemplatePrintPage /> },
      // The Insights report, admins only like Insights.
      {
        element: <AdminOnly />,
        children: [{ path: 'insights/report', element: <InsightsReportPage /> }],
      },
    ],
  },
]);
