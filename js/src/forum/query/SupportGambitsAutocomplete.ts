import type Mithril from 'mithril';
import app from 'flarum/forum/app';
import Button from 'flarum/common/components/Button';
import { canHandleSupportTickets } from '../utils/permissions';
import { ticketTypes } from '../../common/ticketTypes';

export interface GambitsAutocompleteLike {
  suggestions(query: string): Array<Mithril.Vnode>;
}

function gambitTrans(key: string, fallback: string): string {
  const fullKey = 'linkrobins-support.lib.gambits.tickets.' + key;
  return ((app.translator as any)?.translations?.[fullKey] && app.translator.trans(fullKey, {}, true)) || fallback;
}

export default class SupportGambitsAutocomplete implements GambitsAutocompleteLike {
  protected query = '';

  constructor(
    public resource: string,
    public jqueryInput: () => JQuery<HTMLInputElement>,
    public onchange: (value: string) => void,
    public afterSuggest: (value: string) => void
  ) {}

  suggestions(query: string): Array<Mithril.Vnode> {
    this.query = query;
    const $input = this.jqueryInput();
    const cursorPosition = ($input && $input[0] && $input[0].selectionStart) ?? query.length;
    const chunk = query.slice(0, cursorPosition);
    const match = chunk.match(/\S+$/);
    const typed = match ? match[0] : '';
    const tokenStart = match ? cursorPosition - typed.length : cursorPosition;

    const isNegated = typed.startsWith('-');
    const normalized = isNegated ? typed.slice(1) : typed;
    const colonIdx = normalized.indexOf(':');

    // Case 1: Typing a value for a specific gambit (e.g. is:, priority:, assigned:, etc.)
    if (colonIdx !== -1) {
      const gambitKey = normalized.slice(0, colonIdx).toLowerCase();
      const valQuery = normalized.slice(colonIdx + 1).toLowerCase();

      return this.specificValueSuggestions(gambitKey, valQuery, isNegated, typed, tokenStart);
    }

    // Case 2: Typing a gambit key or general search input
    return this.topLevelGambitSuggestions(normalized, isNegated, typed, tokenStart);
  }

  protected specificValueSuggestions(
    gambitKey: string,
    valQuery: string,
    isNegated: boolean,
    typed: string,
    tokenStart: number
  ): Array<Mithril.Vnode> {
    const isStaff = canHandleSupportTickets();
    let options: Array<{ key: string; hint: string }> = [];

    if (gambitKey === 'is') {
      options = [
        { key: 'open', hint: gambitTrans('status.statuses.open', 'Open tickets') },
        { key: 'in-progress', hint: gambitTrans('status.statuses.in_progress', 'In progress') },
        { key: 'awaiting-response', hint: gambitTrans('status.statuses.awaiting_response', 'Awaiting response') },
        { key: 'resolved', hint: gambitTrans('status.statuses.resolved', 'Resolved') },
        { key: 'closed', hint: gambitTrans('status.statuses.closed', 'Closed') },
      ];
      if (isStaff) {
        options.push(
          { key: 'unassigned', hint: gambitTrans('unassigned.hint', 'Unassigned tickets') },
          { key: 'mine', hint: gambitTrans('mine.hint', 'Tickets filed by me') },
          { key: 'assigned', hint: 'Claimed tickets' }
        );
      }
    } else if (gambitKey === 'priority' && isStaff) {
      options = [
        { key: 'urgent', hint: gambitTrans('priority.levels.urgent', 'Urgent priority') },
        { key: 'normal', hint: gambitTrans('priority.levels.normal', 'Normal priority') },
        { key: 'low', hint: gambitTrans('priority.levels.low', 'Low priority') },
      ];
    } else if (gambitKey === 'assigned' && isStaff) {
      options = [
        { key: 'me', hint: gambitTrans('assigned.options.me', 'Assigned to me') },
        { key: 'none', hint: gambitTrans('assigned.options.none', 'Unassigned tickets') },
      ];
    } else if (gambitKey === 'type') {
      const drivers = ticketTypes.all();
      options = drivers.map((driver) => ({
        key: driver.id,
        hint: (typeof driver.name === 'function' ? driver.name() : driver.id) as string,
      }));
    } else if (gambitKey === 'category' || gambitKey === 'cat') {
      const categories: any[] = app.store.all('linkrobins-support-categories') || [];
      options = categories.map((cat: any) => ({
        key: cat.slug(),
        hint: cat.name(),
      }));
    }

    const filtered = options.filter((opt) => !valQuery || opt.key.toLowerCase().includes(valQuery) || opt.hint.toLowerCase().includes(valQuery));

    return filtered.map((opt) =>
      this.gambitSuggestion(opt.key, opt.hint, () => this.suggest(`${isNegated ? '-' : ''}${gambitKey}:${opt.key} `, typed, tokenStart), false)
    );
  }

  protected topLevelGambitSuggestions(normalized: string, isNegated: boolean, typed: string, tokenStart: number): Array<Mithril.Vnode> {
    const isStaff = canHandleSupportTickets();
    const categories: any[] = app.store.all('linkrobins-support-categories') || [];
    const catSlugs = categories.map((c: any) => c.slug()).filter(Boolean);
    const catHint = catSlugs.length > 0 ? catSlugs.slice(0, 3).join(', ') + (catSlugs.length > 3 ? '…' : '') : gambitTrans('category.hint', 'slug');

    const drivers = ticketTypes.all();
    const typeHint = drivers.length > 0 ? drivers.map((d) => d.id).join(' or ') : gambitTrans('type.hint', 'standard or appeal');

    const items = [
      {
        key: 'is',
        hint: 'open, in-progress, awaiting-response, resolved, closed' + (isStaff ? ', unassigned, mine' : ''),
      },
      ...(isStaff
        ? [
            { key: 'priority', hint: gambitTrans('priority.hint', 'urgent, normal, or low') },
            { key: 'assigned', hint: gambitTrans('assigned.hint', 'me or none') },
            { key: 'author', hint: gambitTrans('author.hint', 'username') },
          ]
        : []),
      { key: 'category', hint: catHint },
      { key: 'type', hint: typeHint },
    ];

    const filtered = items.filter((item) => !normalized || item.key.toLowerCase().includes(normalized));

    return filtered.map((item) =>
      this.gambitSuggestion(
        item.key,
        item.hint,
        (negated?: boolean) => {
          const neg = typeof negated === 'boolean' ? negated : isNegated;
          this.suggest(`${neg ? '-' : ''}${item.key}:`, typed, tokenStart);
        },
        true
      )
    );
  }

  protected gambitSuggestion(key: string, value: string | null, suggest: (negated?: boolean) => void, hasActions: boolean = true): Mithril.Vnode {
    return m(
      'li',
      m('span.Dropdown-item.GambitsAutocomplete-gambit', [
        m('button.Button--ua-reset', { type: 'button', onclick: () => suggest() }, [
          m('span.GambitsAutocomplete-gambit-key', [key, hasActions ? ':' : '']),
          value ? m('span.GambitsAutocomplete-gambit-value', value) : null,
        ]),
        hasActions
          ? m('span.GambitsAutocomplete-gambit-actions', [
              m(Button, {
                class: 'Button Button--icon',
                onclick: () => suggest(false),
                icon: 'fas fa-plus',
                'aria-label': app.translator.trans('core.lib.search.gambit_plus_button_a11y_label'),
              }),
              m(Button, {
                class: 'Button Button--icon',
                onclick: () => suggest(true),
                icon: 'fas fa-minus',
                'aria-label': app.translator.trans('core.lib.search.gambit_minus_button_a11y_label'),
              }),
            ])
          : null,
      ])
    );
  }

  protected suggest(text: string, fromTyped: string, start: number) {
    const $input = this.jqueryInput();
    const query = this.query;
    const replaced = query.slice(0, start) + text + query.slice(start + fromTyped.length);

    this.onchange(replaced);
    if ($input && $input[0]) {
      $input[0].focus();
      setTimeout(() => {
        try {
          $input[0].setSelectionRange(start + text.length, start + text.length);
        } catch (e) {}
        m.redraw();
      }, 50);
    }

    this.afterSuggest(replaced);
  }
}
