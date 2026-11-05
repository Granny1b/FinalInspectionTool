import { useId, type ReactNode, type Ref } from 'react';
import { plural } from '../format';
import { DeviationList } from './DeviationList';
import type { Report } from './model';
import { PaperMonthChart } from './PaperMonthChart';
import { ModelTable, ShareTable, TopTable } from './ReportTables';
import '../../print/print.css';
import './report.css';

type Props = {
  report: Report;
  logoUrl: string;
  /** Data, the logo and the fonts are all in: printing now gives the finished document. */
  ready: boolean;
  rootRef: Ref<HTMLDivElement>;
};

/**
 * The deviation report on A4 (brief §5.5, printed): what it covers, the headline numbers, the
 * month chart, severity, the top 10 checkpoints and the breakdowns, as the Insights page shows
 * them for the same filters; then, when asked for, the deviation rows behind them. One sheet that
 * runs onto as many pages as it needs, each part kept whole with its heading. The attributes on
 * the root are what tests and autoprint wait for, as on the inspection's printout.
 */
export function ReportDocument({ report, logoUrl, ready, rootRef }: Props) {
  const titleId = useId();
  return (
    <div
      ref={rootRef}
      className="paper paper-report"
      data-print-root=""
      data-print-mode="insights"
      data-print-ready={ready ? 'true' : 'false'}
    >
      <section className="paper-sheet" aria-labelledby={titleId}>
        <div className="report-head">
          <img className="paper-logo" src={logoUrl} alt={report.companyName} />
          <p className="report-head-period">{report.period}</p>
        </div>
        <h2 id={titleId} className="report-title">
          {report.title}
        </h2>
        <p className="paper-company">{report.companyName}</p>
        <dl className="report-facts">
          {report.facts.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {report.unreadable && (
          <p className="report-note" role="note">
            {report.unreadable}
          </p>
        )}
        {report.empty ? <NoInspections /> : <Contents report={report} />}
      </section>
      {report.list && <DeviationList list={report.list} footer={report.subject} />}
    </div>
  );
}

function NoInspections() {
  return (
    <div className="report-empty">
      <h3>No inspections match these filters</h3>
      <p>
        Only finalised inspections count unless inspections in progress are included. Try a longer
        period or another model on the Insights page.
      </p>
    </div>
  );
}

function Contents({ report }: { report: Report }) {
  const total = report.deviations;
  const counted = plural(total, 'deviation');
  return (
    <>
      <Section title="Headline numbers">
        <dl className="report-kpis">
          {report.kpis.map((kpi) => (
            <div key={kpi.label}>
              <dt>{kpi.label}</dt>
              <dd className="report-kpi-value">{kpi.value}</dd>
              <dd className="report-kpi-detail">{kpi.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="Deviations per month"
        description="By the date on the inspection’s front page."
        aside={counted}
        breakable
      >
        <PaperMonthChart months={report.months} />
      </Section>

      <Section title="By severity" aside={counted}>
        {total > 0 ? (
          <ShareTable label="Severity" rows={report.severity} total={total} />
        ) : (
          <None>No deviations in this selection.</None>
        )}
      </Section>

      <Section
        title="Top 10 recurring checkpoints"
        description="The checkpoints that fail most often, where they are in the checklist now. Of inspections: the share of the inspections whose checklist had the checkpoint."
      >
        {report.top.length > 0 ? (
          <TopTable rows={report.top} showModel={report.showModel} />
        ) : (
          <None>No checkpoint failed in this selection.</None>
        )}
      </Section>

      <Section
        title="Per section"
        description={
          report.showModel
            ? 'Sections with the same title count together.'
            : 'Deviations per section.'
        }
        aside={counted}
      >
        {report.sections.length > 0 ? (
          <ShareTable label="Section" rows={report.sections} total={total} />
        ) : (
          <None>No deviations in this selection.</None>
        )}
      </Section>

      <Section
        title="Per model"
        description="Deviations, with the inspections they come from."
        aside={counted}
      >
        <ModelTable rows={report.models} total={total} />
      </Section>

      <Section
        title="By responsible"
        description="Who is responsible for fixing them."
        aside={counted}
      >
        {report.resps.length > 0 ? (
          <ShareTable label="Responsible" rows={report.resps} total={total} />
        ) : (
          <None>No deviations in this selection.</None>
        )}
      </Section>

      <Section title="By category" description="What kind of deviations they are." aside={counted}>
        {report.categories.length > 0 ? (
          <ShareTable label="Category" rows={report.categories} total={total} />
        ) : (
          <None>No deviations in this selection.</None>
        )}
      </Section>
    </>
  );
}

type SectionProps = {
  title: string;
  /** What is counted, under the title. */
  description?: string;
  /** On the right of the title: the total the shares are of. */
  aside?: string;
  /** May run on to the next page between its parts (which keep themselves whole). */
  breakable?: boolean;
  children: ReactNode;
};

/** A part of the report under its heading, kept whole on a page when it fits on one. */
function Section({ title, description, aside, breakable, children }: SectionProps) {
  const titleId = useId();
  return (
    <section
      className="report-section"
      aria-labelledby={titleId}
      data-breakable={breakable || undefined}
    >
      <div className="report-section-head">
        <div>
          <h3 id={titleId}>{title}</h3>
          {description && <p className="report-section-description">{description}</p>}
        </div>
        {aside && <p className="report-section-aside">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

function None({ children }: { children: ReactNode }) {
  return <p className="report-none">{children}</p>;
}
