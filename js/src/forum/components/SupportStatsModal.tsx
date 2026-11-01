import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import extractText from 'flarum/common/utils/extractText';

const WINDOWS = [7, 30, 90];

/** A duration in seconds, read at a glance: minutes, hours, or days. */
function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '–';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return extractText(app.translator.trans('linkrobins-support.forum.stats.minutes', { count: Math.max(1, minutes) }));
  const hours = seconds / 3600;
  if (hours < 48) return extractText(app.translator.trans('linkrobins-support.forum.stats.hours', { count: Math.round(hours * 10) / 10 }));
  return extractText(app.translator.trans('linkrobins-support.forum.stats.days', { count: Math.round((hours / 24) * 10) / 10 }));
}

function shortDate(start: string): string {
  return new Date(start + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function periodLabel(start: string, days: number): string {
  return days === 7 ? shortDate(start) : extractText(app.translator.trans('linkrobins-support.forum.stats.week_of', { date: shortDate(start) }));
}

/**
 * Staff-only support stats in a wide modal, opened from the account menu.
 * Laid out the way LR Birdseye's Analytics modal is (range buttons at the
 * top right, a row of tiles, titled cards), so the two read as one product;
 * keep them in step. Everything comes from GET /api/linkrobins-support-stats,
 * which is staff-only on the server too.
 */
export default class SupportStatsModal extends Modal<any> {
  days = 30;
  loading = true;
  error = false;
  data: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this._load();
  }

  className() {
    return 'LinkRobinsSupportStatsModal';
  }

  title() {
    return app.translator.trans('linkrobins-support.forum.stats.title');
  }

  _load() {
    this.loading = true;
    this.error = false;
    m.redraw();
    app
      .request({ method: 'GET', url: app.forum.attribute('apiUrl') + '/linkrobins-support-stats', params: { days: this.days } })
      .then((res: any) => {
        this.data = res && res.data;
        this.loading = false;
        m.redraw();
      })
      .catch(() => {
        this.error = true;
        this.loading = false;
        m.redraw();
      });
  }

  content() {
    return (
      <div className="Modal-body">
        <div className="SupportStats">{this._body()}</div>
      </div>
    );
  }

  _body() {
    if (this.loading && !this.data) return <LoadingIndicator />;
    if (this.error || !this.data) {
      return <p className="helpText">{app.translator.trans('linkrobins-support.forum.stats.load_failed')}</p>;
    }

    const d = this.data;
    const fr = d.firstResponse;
    const tt = d.timeToResolve;

    return (
      <>
        <div className="SupportStats-header">
          <span />
          <div
            className="SupportStats-ranges"
            role="group"
            aria-label={extractText(app.translator.trans('linkrobins-support.forum.stats.range'))}
          >
            {WINDOWS.map((n) => (
              <Button
                className={`Button--size-sm${this.days === n ? ' Button--primary' : ''}`}
                aria-pressed={this.days === n ? 'true' : 'false'}
                onclick={() => {
                  if (this.days === n) return;
                  this.days = n;
                  this._load();
                }}
              >
                {app.translator.trans('linkrobins-support.forum.stats.n_days', { count: n })}
              </Button>
            ))}
          </div>
        </div>

        <div className="SupportStats-tiles">
          {this._tile(app.translator.trans('linkrobins-support.forum.stats.opened'), String(d.opened))}
          {this._tile(app.translator.trans('linkrobins-support.forum.stats.closed'), String(d.closed))}
          {this._tile(app.translator.trans('linkrobins-support.forum.stats.first_response'), duration(fr.median))}
          {this._tile(app.translator.trans('linkrobins-support.forum.stats.time_to_resolve'), duration(tt.median))}
        </div>

        {this._card(
          app.translator.trans('linkrobins-support.forum.stats.speed'),
          app.translator.trans('linkrobins-support.forum.stats.median_note'),
          <div className="SupportStats-strip">
            {this._mini(duration(fr.median), app.translator.trans('linkrobins-support.forum.stats.first_response'))}
            {this._mini(duration(fr.p90), app.translator.trans('linkrobins-support.forum.stats.first_response_slow'))}
            {this._mini(duration(tt.median), app.translator.trans('linkrobins-support.forum.stats.time_to_resolve'))}
            {this._mini(duration(tt.p90), app.translator.trans('linkrobins-support.forum.stats.resolve_slow'))}
            {this._mini(String(fr.unanswered), app.translator.trans('linkrobins-support.forum.stats.still_waiting'))}
          </div>
        )}

        {this._volumeCard(d)}

        <div className="SupportStats-cards">
          {this._card(
            app.translator.trans('linkrobins-support.forum.stats.backlog'),
            null,
            <div className="SupportStats-strip">
              {this._mini(String(d.backlog.waiting), app.translator.trans('linkrobins-support.forum.stats.waiting'))}
              {this._mini(String(d.backlog.olderThan3Days), app.translator.trans('linkrobins-support.forum.stats.older_3'))}
              {this._mini(String(d.backlog.olderThan7Days), app.translator.trans('linkrobins-support.forum.stats.older_7'))}
              {this._mini(String(d.backlog.unassigned), app.translator.trans('linkrobins-support.forum.stats.unassigned'))}
            </div>
          )}
          {this._endingsCard(d.endings)}
        </div>

        {this._staffCard(d.staff)}

        <p className="SupportStats-note helpText">{app.translator.trans('linkrobins-support.forum.stats.footnote')}</p>
      </>
    );
  }

  _tile(label: any, value: string) {
    return (
      <div className="SupportStats-tile">
        <div className="SupportStats-tileLabel">{label}</div>
        <div className="SupportStats-tileValue">{value}</div>
      </div>
    );
  }

  _mini(value: string, label: any) {
    return (
      <div>
        <div className="SupportStats-miniValue">{value}</div>
        <div className="SupportStats-miniLabel">{label}</div>
      </div>
    );
  }

  _card(title: any, note: any, body: any) {
    return (
      <div className="SupportStats-card">
        <div className="SupportStats-cardTitle">
          <span className="SupportStats-cardTitleText">{title}</span>
          {note && <span className="SupportStats-span">{note}</span>}
        </div>
        {body}
      </div>
    );
  }

  _endingsCard(endings: any) {
    const total = endings.confirmed + endings.auto + endings.staff;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) + '%' : '–');

    return this._card(
      app.translator.trans('linkrobins-support.forum.stats.endings'),
      null,
      total === 0 ? (
        <p className="helpText">{app.translator.trans('linkrobins-support.forum.stats.no_endings')}</p>
      ) : (
        <div className="SupportStats-strip">
          {this._mini(pct(endings.confirmed), app.translator.trans('linkrobins-support.forum.stats.confirmed'))}
          {this._mini(pct(endings.auto), app.translator.trans('linkrobins-support.forum.stats.auto'))}
          {this._mini(pct(endings.staff), app.translator.trans('linkrobins-support.forum.stats.by_staff'))}
        </div>
      )
    );
  }

  /**
   * Opened vs closed per period, as paired columns: a legend in the card
   * title, a dark tooltip on the hovered period (the Birdseye chart's), and
   * the same figures as a table for anyone who cannot read the chart.
   */
  _volumeCard(d: any) {
    const volume: any[] = d.volume;
    const days: number = d.days;
    const max = Math.max(1, ...volume.map((v) => Math.max(v.opened, v.closed)));
    const span = volume.length ? `${shortDate(volume[0].start)} – ${shortDate(volume[volume.length - 1].start)}` : '';
    const labelEvery = volume.length > 8 ? Math.ceil(volume.length / 6) : 1;

    return (
      <div className="SupportStats-card">
        <div className="SupportStats-cardTitle">
          <span className="SupportStats-cardTitleText">{app.translator.trans('linkrobins-support.forum.stats.volume')}</span>
          <span className="SupportStats-cardTitleRight">
            <span className="SupportStats-legend">
              <span className="SupportStats-swatch is-opened" />
              {app.translator.trans('linkrobins-support.forum.stats.legend_opened')}
            </span>
            <span className="SupportStats-legend">
              <span className="SupportStats-swatch is-closed" />
              {app.translator.trans('linkrobins-support.forum.stats.legend_closed')}
            </span>
            <span className="SupportStats-span">{span}</span>
          </span>
        </div>
        <div className="SupportStats-chart">
          {volume.map((v: any, i: number) => {
            const summary = extractText(
              app.translator.trans('linkrobins-support.forum.stats.period_summary', {
                period: periodLabel(v.start, days),
                opened: v.opened,
                closed: v.closed,
              })
            );
            return (
              <div
                key={v.start}
                className="SupportStats-chartCol"
                tabIndex={0}
                data-label={summary}
                aria-label={summary}
              >
                <div className="SupportStats-chartPair">
                  <div className="SupportStats-chartBar is-opened" style={{ height: (v.opened / max) * 100 + '%' }} />
                  <div className="SupportStats-chartBar is-closed" style={{ height: (v.closed / max) * 100 + '%' }} />
                </div>
                <div className="SupportStats-chartLabel">{i % labelEvery === 0 ? shortDate(v.start) : ''}</div>
              </div>
            );
          })}
        </div>
        <details className="SupportStats-table">
          <summary>{app.translator.trans('linkrobins-support.forum.stats.show_table')}</summary>
          <table>
            <thead>
              <tr>
                <th>{app.translator.trans('linkrobins-support.forum.stats.col_period')}</th>
                <th>{app.translator.trans('linkrobins-support.forum.stats.legend_opened')}</th>
                <th>{app.translator.trans('linkrobins-support.forum.stats.legend_closed')}</th>
              </tr>
            </thead>
            <tbody>
              {volume.map((v: any) => (
                <tr key={v.start}>
                  <td>{periodLabel(v.start, days)}</td>
                  <td>{v.opened}</td>
                  <td>{v.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    );
  }

  _staffCard(people: any[]) {
    return this._card(
      app.translator.trans('linkrobins-support.forum.stats.people'),
      null,
      people.length === 0 ? (
        <p className="helpText">{app.translator.trans('linkrobins-support.forum.stats.no_people')}</p>
      ) : (
        <div className="SupportStats-tableScroll">
          <table className="SupportStats-people">
            <thead>
              <tr>
                <th />
                <th>{app.translator.trans('linkrobins-support.forum.stats.col_replies')}</th>
                <th>{app.translator.trans('linkrobins-support.forum.stats.col_tickets')}</th>
                <th>{app.translator.trans('linkrobins-support.forum.stats.col_first')}</th>
                <th>{app.translator.trans('linkrobins-support.forum.stats.col_first_time')}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p: any) => (
                <tr key={p.id}>
                  <td className="SupportStats-person">{p.displayName || p.username}</td>
                  <td>{String(p.replies)}</td>
                  <td>{String(p.tickets)}</td>
                  <td>{String(p.firstResponses)}</td>
                  <td>{duration(p.medianFirstResponse)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    );
  }
}
