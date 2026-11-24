import { createBrowserRouter, Navigate } from 'react-router';
import { LoadingShell } from './components/LoadingShell';
import { AppShell } from './components/AppShell';
import { RequireRole } from './components/RequireRole';
import { RouteError } from './components/RouteError';
import { AdminOnly } from './features/insights/report/AdminOnly';
import { PrintShell } from './features/print/PrintShell';
import { MachinePage } from './pages/MachinePage';
import { MachinesPage } from './pages/MachinesPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Only the shell and the machines pages (where the app opens) are in the first download; every
// other page is fetched when it is first opened, so the editors, the print views and the admin
// pages do not slow the start. The page shown stays until the next one has arrived.

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    // Shown when the app is opened straight on a page that is still being fetched.
    hydrateFallbackElement: <LoadingShell />,
    children: [
      { index: true, element: <Navigate to="/machines" replace /> },
      // The machines being built, each with its own checks: where checks are started.
      { path: 'machines', element: <MachinesPage /> },
      {
        path: 'machines/new',
        lazy: async () => {
          const { NewMachinePage } = await import('./pages/NewMachinePage');
          return { element: <NewMachinePage /> };
        },
      },
      { path: 'machines/:id', element: <MachinePage /> },
      // An assembly instruction bound to the machine, signed off step by step.
      {
        path: 'machines/:id/assembly/:assemblyId',
        lazy: async () => {
          const { MachineAssemblyPage } = await import('./pages/MachineAssemblyPage');
          return { element: <MachineAssemblyPage /> };
        },
      },
      {
        path: 'inspections',
        lazy: async () => {
          const { InspectionsPage } = await import('./pages/InspectionsPage');
          return { element: <InspectionsPage /> };
        },
      },
      // A check is started on a machine: pick the machine, then its check.
      {
        path: 'inspections/new',
        lazy: async () => {
          const { StartCheckPage } = await import('./pages/StartCheckPage');
          return { element: <StartCheckPage key="final" kind="final" /> };
        },
      },
      {
        path: 'inspections/:id',
        lazy: async () => {
          const { InspectionPage } = await import('./pages/InspectionPage');
          return { element: <InspectionPage kind="final" /> };
        },
      },
      // A machine's check's own checklist (admins; the page says so to others).
      {
        path: 'inspections/:id/checklist',
        lazy: async () => {
          const { ChecklistEditPage } = await import('./pages/ChecklistEditPage');
          return { element: <ChecklistEditPage kind="final" /> };
        },
      },
      // The quality checks done on machines: inspections of kind quality, listed apart.
      {
        path: 'quality-checks',
        lazy: async () => {
          const { InspectionsPage } = await import('./pages/InspectionsPage');
          return { element: <InspectionsPage kind="quality" /> };
        },
      },
      {
        path: 'quality-checks/new',
        lazy: async () => {
          const { StartCheckPage } = await import('./pages/StartCheckPage');
          return { element: <StartCheckPage key="quality" kind="quality" /> };
        },
      },
      {
        path: 'quality-checks/:id',
        lazy: async () => {
          const { InspectionPage } = await import('./pages/InspectionPage');
          return { element: <InspectionPage kind="quality" /> };
        },
      },
      {
        path: 'quality-checks/:id/checklist',
        lazy: async () => {
          const { ChecklistEditPage } = await import('./pages/ChecklistEditPage');
          return { element: <ChecklistEditPage kind="quality" /> };
        },
      },
      // The deviation log of each kind, for everyone; keyed, so switching starts afresh.
      { path: 'deviations', element: <Navigate to="/deviations/final" replace /> },
      {
        path: 'deviations/final',
        lazy: async () => {
          const { DeviationLogPage } = await import('./pages/DeviationLogPage');
          return { element: <DeviationLogPage key="final" kind="final" /> };
        },
      },
      {
        path: 'deviations/quality',
        lazy: async () => {
          const { DeviationLogPage } = await import('./pages/DeviationLogPage');
          return { element: <DeviationLogPage key="quality" kind="quality" /> };
        },
      },
      {
        path: 'templates',
        lazy: async () => {
          const { TemplatesPage } = await import('./pages/TemplatesPage');
          return { element: <TemplatesPage /> };
        },
      },
      // Admins get the editor, inspectors the latest published revision (decided in the page).
      // A machine template: its landing page (model, name, picture), then what is kept under it.
      {
        path: 'templates/:id/overview',
        lazy: async () => {
          const { TemplateEditorPage } = await import('./pages/TemplateEditorPage');
          return { element: <TemplateEditorPage key="overview" part="overview" /> };
        },
      },
      {
        path: 'templates/:id/assembly',
        lazy: async () => {
          const { TemplateAssemblyPage } = await import('./pages/TemplateAssemblyPage');
          return { element: <TemplateAssemblyPage /> };
        },
      },
      {
        path: 'templates/:id/assembly/:instructionId',
        lazy: async () => {
          const { AssemblyEditorPage } = await import('./pages/AssemblyInstructionPage');
          return { element: <AssemblyEditorPage /> };
        },
      },
      // Its Final inspection tab.
      {
        path: 'templates/:id',
        lazy: async () => {
          const { TemplateEditorPage } = await import('./pages/TemplateEditorPage');
          return { element: <TemplateEditorPage key="checklist" /> };
        },
      },
      {
        path: 'templates/:id/revisions/:revision',
        lazy: async () => {
          const { TemplateRevisionPage } = await import('./pages/TemplateRevisionPage');
          return { element: <TemplateRevisionPage /> };
        },
      },
      // A machine's quality checks: its Quality checks tab, one quality check, a revision of one.
      {
        path: 'templates/:id/quality-checks',
        lazy: async () => {
          const { QualityChecksPage } = await import('./pages/QualityChecksPage');
          return { element: <QualityChecksPage /> };
        },
      },
      {
        path: 'templates/:id/quality-checks/:qcId',
        lazy: async () => {
          const { QualityCheckPage } = await import('./pages/QualityCheckPage');
          return { element: <QualityCheckPage /> };
        },
      },
      {
        path: 'templates/:id/quality-checks/:qcId/revisions/:revision',
        lazy: async () => {
          const { TemplateRevisionPage } = await import('./pages/TemplateRevisionPage');
          return { element: <TemplateRevisionPage /> };
        },
      },
      // Assembly instructions: the list, one (the editor for admins, else its latest revision)
      // and a published revision of one.
      {
        path: 'assembly',
        lazy: async () => {
          const { AssemblyPage } = await import('./pages/AssemblyPage');
          return { element: <AssemblyPage /> };
        },
      },
      {
        path: 'assembly/:id',
        lazy: async () => {
          const { AssemblyInstructionPage } = await import('./pages/AssemblyInstructionPage');
          return { element: <AssemblyInstructionPage /> };
        },
      },
      {
        path: 'assembly/:id/revisions/:revision',
        lazy: async () => {
          const { TemplateRevisionPage } = await import('./pages/TemplateRevisionPage');
          return { element: <TemplateRevisionPage key="assembly" assembly /> };
        },
      },
      {
        element: <RequireRole role="admin" />,
        children: [
          // Steps of assembly instructions flagged for change: the admins' tickets.
          {
            path: 'change-requests',
            lazy: async () => {
              const { ChangeRequestsPage } = await import('./pages/ChangeRequestsPage');
              return { element: <ChangeRequestsPage /> };
            },
          },
          {
            path: 'insights',
            lazy: async () => {
              const { InsightsPage } = await import('./pages/InsightsPage');
              return { element: <InsightsPage /> };
            },
          },
          {
            path: 'settings',
            lazy: async () => {
              const { SettingsPage } = await import('./pages/SettingsPage');
              return { element: <SettingsPage /> };
            },
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // Print routes (brief §6): the preview without the sidebar, signed in like every other page.
  {
    element: <PrintShell />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <></>,
    children: [
      {
        path: 'inspections/:id/print',
        lazy: async () => {
          const { InspectionPrintPage } = await import('./pages/InspectionPrintPage');
          return { element: <InspectionPrintPage kind="final" /> };
        },
      },
      // A quality check's report: entire, or only its deviations.
      {
        path: 'quality-checks/:id/print',
        lazy: async () => {
          const { InspectionPrintPage } = await import('./pages/InspectionPrintPage');
          return { element: <InspectionPrintPage kind="quality" /> };
        },
      },
      {
        path: 'templates/:id/print',
        lazy: async () => {
          const { TemplatePrintPage } = await import('./pages/TemplatePrintPage');
          return { element: <TemplatePrintPage /> };
        },
      },
      // The deviation log under the log page's filters, for the machine.
      {
        path: 'deviations/final/print',
        lazy: async () => {
          const { DeviationLogPrintPage } = await import('./pages/DeviationLogPrintPage');
          return { element: <DeviationLogPrintPage key="final" kind="final" /> };
        },
      },
      {
        path: 'deviations/quality/print',
        lazy: async () => {
          const { DeviationLogPrintPage } = await import('./pages/DeviationLogPrintPage');
          return { element: <DeviationLogPrintPage key="quality" kind="quality" /> };
        },
      },
      // The Insights report, admins only like Insights.
      {
        element: <AdminOnly />,
        children: [
          {
            path: 'insights/report',
            lazy: async () => {
              const { InsightsReportPage } = await import('./pages/InsightsReportPage');
              return { element: <InsightsReportPage /> };
            },
          },
        ],
      },
    ],
  },
]);
