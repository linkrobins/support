import Modal from 'flarum/common/components/Modal';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Button from 'flarum/common/components/Button';
import { tr, trText } from '../utils/translate';

const WINDOWS = [7, 30, 90];

/** A duration in seconds, read at a glance: minutes, hours, or days. */
function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return trText('stats.no_data', 'Not enough data yet');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return trText('stats.minutes', '{count} min', { count: Math.max(1, minutes) });
  const hours = seconds / 3600;
  if (hours < 48) return trText('stats.hours', '{count} h', { count: Math.round(hours * 10) / 10 });
  return trText('stats.days', '{count} days', { count: Math.round((hours / 24) * 10) / 10 });
}

function shortDate(start: string): string {
  return new Date(start + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function periodLabel(start: string, days: number): string {
  return days === 7 ? shortDate(start) : trText('stats.week_of', 'Week of {date}', { date: shortDate(start) });
}

/**
 * Staff-only support stats, opened from the sidebar as a modal so staff can
 * check the numbers without leaving the list they are working in: how fast
 * tickets are answered and resolved, how the backlog looks, how tickets end,
 * and who is answering them. Everything comes from
 * GET /api/linkrobins-support-stats (staff-only on the server too); nothing
 * here is tracked specially.
 */
export default class SupportStatsModal extends Modal<any> {
  days = 30;
  loading = true;
  error = false;
  data: any = null;
  hover: number | null = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this._load();
  }

  className() {
    return 'LinkRobinsSupport-statsModal Modal--large';
  }

  title() {
    return tr('stats.title', 'Support stats');
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
    return m('div', { className: 'Modal-body LinkRobinsSupport-stats' }, [
      m(
        'div',
        { className: 'LinkRobinsSupport-stats-range', role: 'group', 'aria-label': trText('stats.range', 'Time range') },
        WINDOWS.map((d) =>
          m(
            Button,
            {
              className: 'Button' + (this.days === d ? ' Button--primary' : ''),
              'aria-pressed': this.days === d ? 'true' : 'false',
              onclick: () => {
                if (this.days === d) return;
                this.days = d;
                this._load();
              },
            },
            trText('stats.last_days', 'Last {count} days', { count: d })
          )
        )
      ),
      this.loading
        ? m(LoadingIndicator)
        : this.error || !this.data
          ? m('div', { className: 'LinkRobinsSupport-empty' }, tr('stats.load_failed', 'Could not load stats.'))
          : this._renderStats(this.data),
    ]);
  }

  _tile(label: any, value: any, note?: any) {
    return m('div', { className: 'LinkRobinsSupport-tile' }, [
      m('div', { className: 'LinkRobinsSupport-tile-label' }, label),
      m('div', { className: 'LinkRobinsSupport-tile-value' }, value),
      note ? m('div', { className: 'LinkRobinsSupport-tile-note' }, note) : null,
    ]);
  }

  _renderStats(d: any) {
    const fr = d.firstResponse;
    const tt = d.timeToResolve;
    const endings = d.endings;
    const ended = endings.confirmed + endings.auto + endings.staff;

    return [
      m('section', { className: 'LinkRobinsSupport-tiles' }, [
        this._tile(tr('stats.opened', 'Tickets opened'), d.opened),
        this._tile(tr('stats.closed', 'Tickets closed'), d.closed),
        this._tile(
          tr('stats.first_response', 'First response'),
          duration(fr.median),
          fr.median === null
            ? null
            : [
                trText('stats.slowest', 'Slowest tenth: {time}', { time: duration(fr.p90) }),
                fr.unanswered ? m('div', null, trText('stats.unanswered', '{count} still waiting', { count: fr.unanswered })) : null,
              ]
        ),
        this._tile(
          tr('stats.time_to_resolve', 'Time to resolve'),
          duration(tt.median),
          tt.median === null ? null : trText('stats.slowest', 'Slowest tenth: {time}', { time: duration(tt.p90) })
        ),
      ]),

      m('section', { className: 'LinkRobinsSupport-stats-section' }, [
        m('h2', null, tr('stats.volume', 'Opened and closed')),
        this._renderVolume(d.volume, d.days),
      ]),

      m('section', { className: 'LinkRobinsSupport-stats-section' }, [
        m('h2', null, tr('stats.backlog', 'Backlog right now')),
        m('div', { className: 'LinkRobinsSupport-tiles' }, [
          this._tile(tr('stats.waiting', 'Waiting on staff or the owner'), d.backlog.waiting),
          this._tile(tr('stats.older_3', 'Open longer than 3 days'), d.backlog.olderThan3Days),
          this._tile(tr('stats.older_7', 'Open longer than 7 days'), d.backlog.olderThan7Days),
          this._tile(tr('stats.unassigned', 'Unassigned'), d.backlog.unassigned),
        ]),
      ]),

      m('section', { className: 'LinkRobinsSupport-stats-section' }, [
        m('h2', null, tr('stats.endings', 'How resolved tickets were closed')),
        ended === 0
          ? m('p', { className: 'LinkRobinsSupport-stats-muted' }, tr('stats.no_endings', 'No resolved tickets have been closed in this period.'))
          : m('div', { className: 'LinkRobinsSupport-tiles' }, [
              this._tile(
                tr('stats.confirmed', 'Confirmed solved by the owner'),
                endings.confirmed,
                Math.round((endings.confirmed / ended) * 100) + '%'
              ),
              this._tile(tr('stats.auto', 'Closed automatically'), endings.auto, Math.round((endings.auto / ended) * 100) + '%'),
              this._tile(tr('stats.by_staff', 'Closed by staff'), endings.staff, Math.round((endings.staff / ended) * 100) + '%'),
            ]),
      ]),

      m('section', { className: 'LinkRobinsSupport-stats-section' }, [
        m('h2', null, tr('stats.people', 'By staff member')),
        d.staff.length === 0
          ? m('p', { className: 'LinkRobinsSupport-stats-muted' }, tr('stats.no_people', 'No staff replies in this period.'))
          : m('table', { className: 'LinkRobinsSupport-statsTable' }, [
              m(
                'thead',
                m('tr', [
                  m('th', tr('stats.col_person', 'Staff member')),
                  m('th', tr('stats.col_replies', 'Replies')),
                  m('th', tr('stats.col_tickets', 'Tickets')),
                  m('th', tr('stats.col_first', 'First to answer')),
                  m('th', tr('stats.col_first_time', 'Typical first response')),
                ])
              ),
              m(
                'tbody',
                d.staff.map((p: any) =>
                  m('tr', { key: p.id }, [
                    m('td', p.displayName || p.username),
                    m('td', p.replies),
                    m('td', p.tickets),
                    m('td', p.firstResponses),
                    m('td', p.medianFirstResponse === null ? '' : duration(p.medianFirstResponse)),
                  ])
                )
              ),
            ]),
      ]),

      m(
        'p',
        { className: 'LinkRobinsSupport-stats-muted LinkRobinsSupport-stats-footnote' },
        tr(
          'stats.footnote',
          'Times are typical (median) values. Status history is recorded from this version on, so time to resolve and how tickets were closed fill in as new tickets move through.'
        )
      ),
    ];
  }

  /**
   * Opened vs closed per period, as paired columns. Two series, so a legend
   * sits above; hovering a period shows its exact numbers; the same figures
   * are available as a table below for anyone who cannot read the chart.
   */
  _renderVolume(volume: any[], days: number) {
    const max = Math.max(1, ...volume.map((v) => Math.max(v.opened, v.closed)));
    const hovered = this.hover !== null ? volume[this.hover] : null;

    // Label every period while they fit; past eight, every few, so they never collide.
    const labelEvery = volume.length > 8 ? Math.ceil(volume.length / 6) : 1;

    return m('div', { className: 'LinkRobinsSupport-chart' }, [
      m('div', { className: 'LinkRobinsSupport-chart-legend' }, [
        m('span', [m('i', { className: 'LinkRobinsSupport-chart-key is-opened' }), tr('stats.opened', 'Tickets opened')]),
        m('span', [m('i', { className: 'LinkRobinsSupport-chart-key is-closed' }), tr('stats.closed', 'Tickets closed')]),
        // The hover readout lives in the legend row, so it never covers a column.
        hovered
          ? m(
              'span',
              { className: 'LinkRobinsSupport-chart-readout', role: 'status' },
              trText('stats.period_summary', '{period}: {opened} opened, {closed} closed', {
                period: periodLabel(hovered.start, days),
                opened: hovered.opened,
                closed: hovered.closed,
              })
            )
          : null,
      ]),
      m('div', { className: 'LinkRobinsSupport-chart-frame' }, [
        m('span', { className: 'LinkRobinsSupport-chart-max' }, max),
        m(
          'div',
          { className: 'LinkRobinsSupport-chart-plot', onmouseleave: () => (this.hover = null) },
          volume.map((v: any, i: number) =>
            m(
              'div',
              {
                key: v.start,
                className: 'LinkRobinsSupport-chart-group' + (this.hover === i ? ' is-hovered' : ''),
                onmouseenter: () => (this.hover = i),
                tabindex: 0,
                onfocus: () => (this.hover = i),
                'aria-label': trText('stats.period_summary', '{period}: {opened} opened, {closed} closed', {
                  period: periodLabel(v.start, days),
                  opened: v.opened,
                  closed: v.closed,
                }),
              },
              [
                m('div', { className: 'LinkRobinsSupport-chart-bars' }, [
                  m('div', { className: 'LinkRobinsSupport-chart-bar is-opened', style: { height: (v.opened / max) * 100 + '%' } }),
                  m('div', { className: 'LinkRobinsSupport-chart-bar is-closed', style: { height: (v.closed / max) * 100 + '%' } }),
                ]),
                m('div', { className: 'LinkRobinsSupport-chart-label' }, i % labelEvery === 0 ? shortDate(v.start) : ''),
              ]
            )
          )
        ),
      ]),
      m('details', { className: 'LinkRobinsSupport-chart-table' }, [
        m('summary', tr('stats.show_table', 'Show as a table')),
        m('table', { className: 'LinkRobinsSupport-statsTable' }, [
          m(
            'thead',
            m('tr', [
              m('th', tr('stats.col_period', 'Period')),
              m('th', tr('stats.opened', 'Tickets opened')),
              m('th', tr('stats.closed', 'Tickets closed')),
            ])
          ),
          m(
            'tbody',
            volume.map((v: any) => m('tr', { key: v.start }, [m('td', periodLabel(v.start, days)), m('td', v.opened), m('td', v.closed)]))
          ),
        ]),
      ]),
    ]);
  }
}
