import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
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
    return m('div', { className: 'Modal-body' }, m('div', { className: 'SupportStats' }, this._body()));
  }

  _body() {
    if (this.loading && !this.data) return m(LoadingIndicator);
    if (this.error || !this.data) return m('p', { className: 'helpText' }, app.translator.trans('linkrobins-support.forum.stats.load_failed'));

    const d = this.data;
    const fr = d.firstResponse;
    const tt = d.timeToResolve;

    return [
      m('div', { className: 'SupportStats-header' }, [
        m('span'),
        m(
          'div',
          {
            className: 'SupportStats-ranges',
            role: 'group',
            'aria-label': extractText(app.translator.trans('linkrobins-support.forum.stats.range')),
          },
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
              app.translator.trans('linkrobins-support.forum.stats.n_days', { count: n })
            )
          )
        ),
      ]),

      m('div', { className: 'SupportStats-tiles' }, [
        this._tile(app.translator.trans('linkrobins-support.forum.stats.opened'), String(d.opened)),
        this._tile(app.translator.trans('linkrobins-support.forum.stats.closed'), String(d.closed)),
        this._tile(app.translator.trans('linkrobins-support.forum.stats.first_response'), duration(fr.median)),
        this._tile(app.translator.trans('linkrobins-support.forum.stats.time_to_resolve'), duration(tt.median)),
      ]),

      this._card(
        app.translator.trans('linkrobins-support.forum.stats.speed'),
        app.translator.trans('linkrobins-support.forum.stats.median_note'),
        m('div', { className: 'SupportStats-strip' }, [
          this._mini(duration(fr.median), app.translator.trans('linkrobins-support.forum.stats.first_response')),
          this._mini(duration(fr.p90), app.translator.trans('linkrobins-support.forum.stats.first_response_slow')),
          this._mini(duration(tt.median), app.translator.trans('linkrobins-support.forum.stats.time_to_resolve')),
          this._mini(duration(tt.p90), app.translator.trans('linkrobins-support.forum.stats.resolve_slow')),
          this._mini(String(fr.unanswered), app.translator.trans('linkrobins-support.forum.stats.still_waiting')),
        ])
      ),

      this._volumeCard(d),

      m('div', { className: 'SupportStats-cards' }, [
        this._card(
          app.translator.trans('linkrobins-support.forum.stats.backlog'),
          null,
          m('div', { className: 'SupportStats-strip' }, [
            this._mini(String(d.backlog.waiting), app.translator.trans('linkrobins-support.forum.stats.waiting')),
            this._mini(String(d.backlog.olderThan3Days), app.translator.trans('linkrobins-support.forum.stats.older_3')),
            this._mini(String(d.backlog.olderThan7Days), app.translator.trans('linkrobins-support.forum.stats.older_7')),
            this._mini(String(d.backlog.unassigned), app.translator.trans('linkrobins-support.forum.stats.unassigned')),
          ])
        ),
        this._endingsCard(d.endings),
      ]),

      this._staffCard(d.staff),

      m('p', { className: 'SupportStats-note helpText' }, app.translator.trans('linkrobins-support.forum.stats.footnote')),
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
      app.translator.trans('linkrobins-support.forum.stats.endings'),
      null,
      total === 0
        ? m('p', { className: 'helpText' }, app.translator.trans('linkrobins-support.forum.stats.no_endings'))
        : m('div', { className: 'SupportStats-strip' }, [
            this._mini(pct(endings.confirmed), app.translator.trans('linkrobins-support.forum.stats.confirmed')),
            this._mini(pct(endings.auto), app.translator.trans('linkrobins-support.forum.stats.auto')),
            this._mini(pct(endings.staff), app.translator.trans('linkrobins-support.forum.stats.by_staff')),
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
        m('span', { className: 'SupportStats-cardTitleText' }, app.translator.trans('linkrobins-support.forum.stats.volume')),
        m('span', { className: 'SupportStats-cardTitleRight' }, [
          m('span', { className: 'SupportStats-legend' }, [
            m('i', { className: 'SupportStats-swatch is-opened' }),
            app.translator.trans('linkrobins-support.forum.stats.legend_opened'),
          ]),
          m('span', { className: 'SupportStats-legend' }, [
            m('i', { className: 'SupportStats-swatch is-closed' }),
            app.translator.trans('linkrobins-support.forum.stats.legend_closed'),
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
              'data-label': extractText(
                app.translator.trans('linkrobins-support.forum.stats.period_summary', {
                  period: periodLabel(v.start, days),
                  opened: v.opened,
                  closed: v.closed,
                })
              ),
              'aria-label': extractText(
                app.translator.trans('linkrobins-support.forum.stats.period_summary', {
                  period: periodLabel(v.start, days),
                  opened: v.opened,
                  closed: v.closed,
                })
              ),
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
        m('summary', app.translator.trans('linkrobins-support.forum.stats.show_table')),
        m('table', [
          m(
            'thead',
            m('tr', [
              m('th', app.translator.trans('linkrobins-support.forum.stats.col_period')),
              m('th', app.translator.trans('linkrobins-support.forum.stats.legend_opened')),
              m('th', app.translator.trans('linkrobins-support.forum.stats.legend_closed')),
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
      app.translator.trans('linkrobins-support.forum.stats.people'),
      null,
      people.length === 0
        ? m('p', { className: 'helpText' }, app.translator.trans('linkrobins-support.forum.stats.no_people'))
        : m('div', { className: 'SupportStats-tableScroll' }, [
            m('table', { className: 'SupportStats-people' }, [
              m(
                'thead',
                m('tr', [
                  m('th', ''),
                  m('th', app.translator.trans('linkrobins-support.forum.stats.col_replies')),
                  m('th', app.translator.trans('linkrobins-support.forum.stats.col_tickets')),
                  m('th', app.translator.trans('linkrobins-support.forum.stats.col_first')),
                  m('th', app.translator.trans('linkrobins-support.forum.stats.col_first_time')),
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
