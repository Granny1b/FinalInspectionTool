import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { ButtonLink } from '../components/Button';
import { StateCard } from '../components/StateCard';
import { filterFromParams } from '../features/insights/filters';
import {
  insightsHref,
  parseList,
  withList,
  withoutAutoprint,
} from '../features/insights/report/links';
import { ReportView } from '../features/insights/report/ReportView';
import { useReport } from '../features/insights/report/useReport';
import { PrintLoadError, PrintLoading, PrintMessage } from '../features/print/PrintStates';

/**
 * /insights/report?<the Insights page's filters>[&deviations=1][&autoprint=1] — the Insights
 * numbers as a printed deviation report, for admins (brief §5.5). `deviations=1` adds the list of
 * deviation rows; `autoprint=1` opens the print dialog once everything has loaded.
 */
export function InsightsReportPage() {
  const [params, setParams] = useSearchParams();
  const filter = filterFromParams(params);
  const includeList = parseList(params);
  const state = useReport(filter, includeList);
  const back = { to: insightsHref(filter), label: 'Back to Insights' };

  const dropAutoprint = useCallback(
    () => setParams((current) => withoutAutoprint(current), { replace: true }),
    [setParams],
  );

  if (state.status === 'invalid') {
    return (
      <PrintMessage>
        <StateCard
          role="alert"
          icon={SlidersHorizontal}
          tone="nok"
          title="These filters can’t be printed"
          hint={state.message}
          action={
            <ButtonLink to={back.to} variant="secondary">
              <ArrowLeft size={16} aria-hidden="true" />
              {back.label}
            </ButtonLink>
          }
        />
      </PrintMessage>
    );
  }
  if (state.status === 'failed') return <PrintLoadError query={state.query} />;
  if (state.status === 'loading') return <PrintLoading />;

  return (
    <ReportView
      report={state.report}
      logoUrl={state.logoUrl}
      shown={state.shown}
      back={back}
      list={{
        value: includeList,
        onChange: (value) => setParams((current) => withList(current, value), { replace: true }),
      }}
      listLoading={state.listLoading}
      autoprint={params.get('autoprint') === '1'}
      onAutoprinted={dropAutoprint}
    />
  );
}
