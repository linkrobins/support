import Modal from 'flarum/common/components/Modal';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import { tr, trText } from '../utils/translate';

const WINDOWS = [7, 30, 90];

/** A duration in seconds, read at a glance: minutes, hours, or days. */
function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '–';
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
    return m('div', { className: 'Modal-body' }, m('div', { className: 'SupportStats' }, this._body()));
  }

  _body() {
    if (this.loading && !this.data) return m(LoadingIndicator);
    if (this.error || !this.data) return m('p', { className: 'helpText' }, tr('stats.load_failed', 'Could not load stats.'));

    const d = this.data;
    const fr = d.firstResponse;
    const tt = d.timeToResolve;

    return [
      m('div', { className: 'SupportStats-header' }, [
        m('span'),
        m(
          'div',
          { className: 'SupportStats-ranges', role: 'group', 'aria-label': trText('stats.range', 'Time range') },
          WINDOWS.map((n) =>
            m(
              'button',
              {
                type: 'button',
                className: 'Button Button--size-sm' + (this.days === n ? ' Button--primary' : ''),
                'aria-pressed': this.days === n ? 'true' : 'false',
                onclick: () => {
                  if (this.days === n) return;
                  this.days = n;
                  this._load();
                },
              },
              trText('stats.n_days', '{count} days', { count: n })
            )
          )
        ),
      ]),

      m('div', { className: 'SupportStats-tiles' }, [
        this._tile(tr('stats.opened', 'Tickets opened'), String(d.opened)),
        this._tile(tr('stats.closed', 'Tickets closed'), String(d.closed)),
        this._tile(tr('stats.first_response', 'First response'), duration(fr.median)),
        this._tile(tr('stats.time_to_resolve', 'Time to resolve'), duration(tt.median)),
      ]),

      this._card(
        tr('stats.speed', 'Response times'),
        tr('stats.median_note', 'typical (median) and slowest tenth'),
        m('div', { className: 'SupportStats-strip' }, [
          this._mini(duration(fr.median), tr('stats.first_response', 'First response')),
          this._mini(duration(fr.p90), tr('stats.first_response_slow', 'Slowest first response')),
          this._mini(duration(tt.median), tr('stats.time_to_resolve', 'Time to resolve')),
          this._mini(duration(tt.p90), tr('stats.resolve_slow', 'Slowest resolve')),
          this._mini(String(fr.unanswered), tr('stats.still_waiting', 'Still waiting for a reply')),
        ])
      ),

      this._volumeCard(d),

      m('div', { className: 'SupportStats-cards' }, [
        this._card(
          tr('stats.backlog', 'Backlog right now'),
          null,
          m('div', { className: 'SupportStats-strip' }, [
            this._mini(String(d.backlog.waiting), tr('stats.waiting', 'Waiting')),
            this._mini(String(d.backlog.olderThan3Days), tr('stats.older_3', 'Over 3 days')),
            this._mini(String(d.backlog.olderThan7Days), tr('stats.older_7', 'Over 7 days')),
            this._mini(String(d.backlog.unassigned), tr('stats.unassigned', 'Unassigned')),
          ])
        ),
        this._endingsCard(d.endings),
      ]),

      this._staffCard(d.staff),

      m(
        'p',
        { className: 'SupportStats-note helpText' },
        tr(
          'stats.footnote',
          'Status history is recorded from this version on, so time to resolve and how tickets were closed fill in as new tickets move through.'
        )
      ),
    ];
  }

  _tile(label: any, value: string) {
    return m('div', { className: 'SupportStats-tile' }, [
      m('div', { className: 'SupportStats-tileLabel' }, label),
      m('div', { className: 'SupportStats-tileValue' }, value),
    ]);
  }

  _mini(value: string, label: any) {
    return m('div', [m('div', { className: 'SupportStats-miniValue' }, value), m('div', { className: 'SupportStats-miniLabel' }, label)]);
  }

  _card(title: any, note: any, body: any) {
    return m('div', { className: 'SupportStats-card' }, [
      m('div', { className: 'SupportStats-cardTitle' }, [
        m('span', { className: 'SupportStats-cardTitleText' }, title),
        note ? m('span', { className: 'SupportStats-span' }, note) : null,
      ]),
      body,
    ]);
  }

  _endingsCard(endings: any) {
    const total = endings.confirmed + endings.auto + endings.staff;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) + '%' : '–');

    return this._card(
      tr('stats.endings', 'How resolved tickets were closed'),
      null,
      total === 0
        ? m('p', { className: 'helpText' }, tr('stats.no_endings', 'None closed in this period.'))
        : m('div', { className: 'SupportStats-strip' }, [
            this._mini(pct(endings.confirmed), tr('stats.confirmed', 'Confirmed by the owner')),
            this._mini(pct(endings.auto), tr('stats.auto', 'Closed automatically')),
            this._mini(pct(endings.staff), tr('stats.by_staff', 'Closed by staff')),
          ])
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

    return m('div', { className: 'SupportStats-card' }, [
      m('div', { className: 'SupportStats-cardTitle' }, [
        m('span', { className: 'SupportStats-cardTitleText' }, tr('stats.volume', 'Opened and closed')),
        m('span', { className: 'SupportStats-cardTitleRight' }, [
          m('span', { className: 'SupportStats-legend' }, [
            m('i', { className: 'SupportStats-swatch is-opened' }),
            tr('stats.legend_opened', 'Opened'),
          ]),
          m('span', { className: 'SupportStats-legend' }, [
            m('i', { className: 'SupportStats-swatch is-closed' }),
            tr('stats.legend_closed', 'Closed'),
          ]),
          m('span', { className: 'SupportStats-span' }, span),
        ]),
      ]),
      m(
        'div',
        { className: 'SupportStats-chart' },
        volume.map((v: any, i: number) =>
          m(
            'div',
            {
              key: v.start,
              className: 'SupportStats-chartCol',
              tabindex: 0,
              'data-label': trText('stats.period_summary', '{period}: {opened} opened, {closed} closed', {
                period: periodLabel(v.start, days),
                opened: v.opened,
                closed: v.closed,
              }),
              'aria-label': trText('stats.period_summary', '{period}: {opened} opened, {closed} closed', {
                period: periodLabel(v.start, days),
                opened: v.opened,
                closed: v.closed,
              }),
            },
            [
              m('div', { className: 'SupportStats-chartPair' }, [
                m('div', { className: 'SupportStats-chartBar is-opened', style: { height: (v.opened / max) * 100 + '%' } }),
                m('div', { className: 'SupportStats-chartBar is-closed', style: { height: (v.closed / max) * 100 + '%' } }),
              ]),
              m('div', { className: 'SupportStats-chartLabel' }, i % labelEvery === 0 ? shortDate(v.start) : ''),
            ]
          )
        )
      ),
      m('details', { className: 'SupportStats-table' }, [
        m('summary', tr('stats.show_table', 'Show as a table')),
        m('table', [
          m(
            'thead',
            m('tr', [
              m('th', tr('stats.col_period', 'Period')),
              m('th', tr('stats.legend_opened', 'Opened')),
              m('th', tr('stats.legend_closed', 'Closed')),
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

  _staffCard(people: any[]) {
    return this._card(
      tr('stats.people', 'By staff member'),
      null,
      people.length === 0
        ? m('p', { className: 'helpText' }, tr('stats.no_people', 'No staff replies in this period.'))
        : m('div', { className: 'SupportStats-tableScroll' }, [
            m('table', { className: 'SupportStats-people' }, [
              m(
                'thead',
                m('tr', [
                  m('th', ''),
                  m('th', tr('stats.col_replies', 'Replies')),
                  m('th', tr('stats.col_tickets', 'Tickets')),
                  m('th', tr('stats.col_first', 'First to answer')),
                  m('th', tr('stats.col_first_time', 'Typical first response')),
                ])
              ),
              m(
                'tbody',
                people.map((p: any) =>
                  m('tr', { key: p.id }, [
                    m('td', { className: 'SupportStats-person' }, p.displayName || p.username),
                    m('td', String(p.replies)),
                    m('td', String(p.tickets)),
                    m('td', String(p.firstResponses)),
                    m('td', duration(p.medianFirstResponse)),
                  ])
                )
              ),
            ]),
          ])
    );
  }
}
