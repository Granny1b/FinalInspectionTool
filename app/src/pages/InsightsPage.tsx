import { SEVERITIES, type Insights, type MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { ChartColumn, SearchX } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError } from '../components/PageStates';
import { BarList, type BarItem } from '../features/insights/BarList';
import { ExportCsvButton } from '../features/insights/ExportCsvButton';
import {
  describePeriod,
  filterFromParams,
  filterKind,
  filterToParams,
  insightsQuery,
  withKind,
  type InsightsFilter,
} from '../features/insights/filters';
import { plural } from '../features/insights/format';
import { InsightsFilters } from '../features/insights/InsightsFilters';
import { InsightsSkeleton } from '../features/insights/InsightsSkeleton';
import { KindSwitch } from '../features/insights/KindSwitch';
import { KpiTiles } from '../features/insights/KpiTiles';
import { Panel } from '../features/insights/Panel';
import { useInsights } from '../features/insights/queries';
import { ReportActions } from '../features/insights/report/ReportActions';
import { SeverityBar } from '../features/insights/SeverityBar';
import { TopCheckpoints } from '../features/insights/TopCheckpoints';
import { capitalised, INSIGHTS_WORDS, type InsightsWords } from '../features/insights/words';
import { errorMessage } from '../lib/api';
import { modelName, useSettings } from '../lib/useSettings';

// Recharts is loaded with the chart, so only admins opening Insights ever download it.
const MonthlyChart = lazy(() => import('../features/insights/MonthlyChart'));

const BY_NAME = new Intl.Collator('sv', { numeric: true });

/**
 * Brief §5.5: KPIs from the deviation table, for admins: of final inspections or, switched at the
 * top, of the quality checks done on machines. The two are never counted together.
 */
export function InsightsPage() {
  const settings = useSettings();
  const models = settings.data?.machineModels;
  const [params, setParams] = useSearchParams();
  const filter = filterFromParams(params);
  // Rendered at once, not as the router's default transition: the controls show what the URL
  // holds, so a checkbox or a date typed in must update with the click or key that changed it.
  const setFilter = (next: InsightsFilter) =>
    setParams(filterToParams(next), { replace: true, flushSync: true });
  const target = insightsQuery(filter);
  const query = 'query' in target ? target.query : null;
  const insights = useInsights(query);
  const [exportError, setExportError] = useState<string | null>(null);
  const kind = filterKind(filter);
  const words = INSIGHTS_WORDS[kind];
  // While the other kind's numbers load, the kept ones are not this kind's: no actions on them.
  const data = insights.data;

  const header = (
    <>
      <PageHeader
        title="Insights"
        description={`Deviation KPIs across finalised ${words.many}, per checkpoint, section and model.`}
        actions={
          data?.modelCodes.length ? (
            <>
              <ReportActions filter={filter} disabled={!query} />
              <ExportCsvButton query={query} onError={setExportError} />
            </>
          ) : undefined
        }
      />
      <div className="mb-6">
        <KindSwitch kind={kind} onChange={(next) => setFilter(withKind(filter, next))} />
      </div>
    </>
  );

  if (insights.isError && !data) {
    return (
      <>
        {header}
        <LoadError
          title="We couldn't load the insights"
          message={errorMessage(insights.error)}
          onRetry={() => void insights.refetch()}
          retrying={insights.isFetching}
        />
      </>
    );
  }
  if (query && !data) {
    return (
      <>
        {header}
        <InsightsSkeleton />
      </>
    );
  }
  if (data && data.modelCodes.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={ChartColumn}
          title="No insights yet"
          hint={`Deviations from finalised ${words.many} will show up here, led by the checkpoints that fail most often.`}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-6">
        <InsightsFilters
          filter={filter}
          models={modelOptions(data?.modelCodes ?? [], filter.model, models)}
          checks={data?.checkNames}
          firstInspectionDate={data?.firstInspectionDate ?? null}
          error={'error' in target ? target.error : undefined}
          updating={insights.isPlaceholderData && insights.isFetching}
          onChange={setFilter}
        />
        {exportError && (
          <Callout tone="error" role="alert" onDismiss={() => setExportError(null)}>
            {exportError}
          </Callout>
        )}
        {insights.isError && (
          <Callout tone="error" role="alert">
            These filters could not be applied. {errorMessage(insights.error)}
          </Callout>
        )}
        {data && query && (
          // While new numbers load, the previous ones stay, dimmed: no flash, no jump.
          <div
            aria-busy={insights.isPlaceholderData}
            className={clsx(
              'space-y-6 transition-opacity',
              insights.isPlaceholderData && 'opacity-60',
            )}
          >
            {data.unreadableRows > 0 && (
              <Callout tone="error" role="status">
                {data.unreadableRows === 1
                  ? '1 deviation record could not be read and is not counted, '
                  : `${data.unreadableRows} deviation records could not be read and are not counted, `}
                so these numbers may be too low.
              </Callout>
            )}
            <Dashboard
              insights={data}
              models={models}
              filter={filter}
              words={words}
              onShowAllTime={() => setFilter({ ...filter, period: 'all' })}
            />
          </div>
        )}
      </div>
    </>
  );
}

type DashboardProps = {
  insights: Insights;
  models: MachineModel[] | undefined;
  /** Inspections or quality checks. */
  words: InsightsWords;
  /** The filters the numbers are for: an empty selection says which. */
  filter: InsightsFilter;
  onShowAllTime: () => void;
};

function Dashboard({ insights, models, filter, words, onShowAllTime }: DashboardProps) {
  const { finalised, inProgress } = insights.inspections;
  if (finalised + inProgress === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={`No ${words.many} in this selection`}
        hint={emptyHint(filter, models, words)}
        action={
          filter.period !== 'all' && (
            <Button variant="secondary" onClick={onShowAllTime}>
              Show all time
            </Button>
          )
        }
      />
    );
  }
  const severityTotal = SEVERITIES.reduce((sum, key) => sum + insights.bySeverity[key], 0);
  // A model is picked, so the model can go unsaid.
  const showModel = !filter.model && insights.perModel.length > 1;

  return (
    <>
      <KpiTiles insights={insights} words={words} />

      <Panel
        title="Top 10 recurring checkpoints"
        description="Checkpoints that fail most often, wherever they sit in the checklist now."
      >
        <TopCheckpoints
          checkpoints={insights.topCheckpoints}
          models={models}
          showModel={showModel}
          words={words}
        />
      </Panel>

      {/* One two-column grid for every panel under the table, so the gutters line up with each
          other and with the middle of the tiles above. */}
      <div className="grid gap-6 md:grid-cols-2">
        <Panel
          title="Deviations per month"
          description={`By the date on the ${words.one}’s front page.`}
        >
          <Suspense fallback={<div className="h-60" aria-hidden="true" />}>
            <MonthlyChart months={insights.perMonth} words={words} />
          </Suspense>
        </Panel>
        {/* As tall as its bar and legend: stretched to the chart beside it, it was mostly empty. */}
        <Panel
          className="md:self-start"
          title="By severity"
          aside={plural(severityTotal, 'deviation')}
        >
          {severityTotal > 0 ? (
            <SeverityBar bySeverity={insights.bySeverity} />
          ) : (
            <p className="py-6 text-center text-sm text-ink-500">No deviations.</p>
          )}
        </Panel>
        <Panel
          title="Per section"
          description={
            showModel ? 'Sections with the same title count together.' : 'Deviations per section.'
          }
        >
          <BarList items={sectionBars(insights)} limit={10} />
        </Panel>
        <Panel title="Per model" description={`Deviations, with the ${words.many} they come from.`}>
          <BarList items={modelBars(insights, models, words)} limit={10} />
        </Panel>
        <Panel title="By responsible" description="Who is responsible for fixing them.">
          <BarList items={respBars(insights)} limit={10} />
        </Panel>
        <Panel title="By category" description="What kind of deviations they are.">
          <BarList items={categoryBars(insights)} limit={10} />
        </Panel>
      </div>
    </>
  );
}

function sectionBars(insights: Insights): BarItem[] {
  return insights.perSection.map(({ title, deviations }) => ({
    key: title ?? '\u0000extra',
    label: title === null ? 'Extra deviations' : title || 'Untitled section',
    note: title === null ? '(not tied to a row)' : undefined,
    value: deviations,
  }));
}

function modelBars(
  insights: Insights,
  models: MachineModel[] | undefined,
  words: InsightsWords,
): BarItem[] {
  return insights.perModel.map(({ modelCode, inspections, deviations }) => ({
    key: modelCode,
    label: modelName(models, modelCode),
    note: `in ${plural(inspections, words.one)}`,
    value: deviations,
  }));
}

function respBars(insights: Insights): BarItem[] {
  return insights.byResp.map(({ resp, deviations }) => ({
    key: resp || '\u0000none',
    label: resp || 'Not assigned',
    value: deviations,
  }));
}

function categoryBars(insights: Insights): BarItem[] {
  return insights.byCategory.map(({ category, deviations }) => ({
    key: category || '\u0000none',
    label: category || 'No category',
    value: deviations,
  }));
}

/**
 * "There are no finalised RigiMill MG inspections in 2025-08.": what the selection is, so an empty
 * month reads as one, and what else counts. Quality checks say which one when one is picked
 * ("…RigiMill MG quality checks of Quality check – Pre start up…").
 */
function emptyHint(
  filter: InsightsFilter,
  models: MachineModel[] | undefined,
  words: InsightsWords,
): string {
  const what = [
    filter.includeInProgress ? '' : 'finalised',
    filter.model ? modelName(models, filter.model) : '',
    words.many,
    words.kind === 'quality' && filter.check ? `of “${filter.check}”` : '',
    describePeriod(filter),
  ]
    .filter(Boolean)
    .join(' ');
  return filter.includeInProgress
    ? `There are no ${what}.`
    : `There are no ${what}. ${capitalised(words.many)} in progress count only when you include them.`;
}

/**
 * The model filter's choices: every model with inspections, by name, plus a model from a shared
 * link that has none (so the select can show it).
 */
function modelOptions(
  codes: readonly string[],
  current: string,
  known: readonly MachineModel[] | undefined,
): MachineModel[] {
  const all = new Set(codes);
  if (current) all.add(current);
  return [...all]
    .map((code) => ({ code, name: modelName(known, code) }))
    .sort((a, b) => BY_NAME.compare(a.name, b.name));
}
