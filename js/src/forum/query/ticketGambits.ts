import type IGambit from 'flarum/common/query/IGambit';
import { BooleanGambit, KeyValueGambit, GambitType, type GroupedGambitSuggestion } from 'flarum/common/query/IGambit';
import { canHandleSupportTickets } from '../utils/permissions';

export const SUPPORT_TICKETS_RESOURCE = 'linkrobins-support-tickets';

/**
 * Filter support tickets by status: is:open, is:in-progress, is:awaiting-response, is:resolved, is:closed.
 * Accepts both kebab-case and snake_case aliases. Supports negation (e.g. -is:closed).
 */
export class StatusGambit implements IGambit<GambitType.Grouped> {
  type = GambitType.Grouped;
  predicates = false;

  key(): string[] {
    return ['open', 'in-progress', 'awaiting-response', 'resolved', 'closed'];
  }

  filterKey(): string {
    return 'status';
  }

  booleanKey(): 'is' | 'has' | 'allows' {
    return 'is';
  }

  groupKey(): string {
    return (app.translator && app.translator.trans('core.lib.gambits.group_keys.' + this.booleanKey(), {}, true)) || 'is';
  }

  pattern(): string {
    const is = this.groupKey();
    return `${is}:(open|in[-_]progress|awaiting[-_](?:response|user)|resolved|closed)`;
  }

  toFilter(matches: string[], negate: boolean): Record<string, any> {
    const key = (negate ? '-' : '') + this.filterKey();
    let val = matches[1].toLowerCase().replace('-', '_');
    if (val === 'awaiting_response') {
      val = 'awaiting_user';
    }
    return {
      [key]: val,
    };
  }

  fromFilter(value: any, negate: boolean): string {
    const is = this.groupKey();
    const normalize = (v: string) => {
      if (v === 'awaiting_user' || v === 'awaiting_response') return 'awaiting-response';
      if (v === 'in_progress') return 'in-progress';
      return v;
    };
    if (Array.isArray(value)) {
      return value.map((v) => `${negate ? '-' : ''}${is}:${normalize(v)}`).join(' ');
    }
    return `${negate ? '-' : ''}${is}:${normalize(value)}`;
  }

  suggestion(): GroupedGambitSuggestion {
    return {
      group: this.groupKey(),
      key: this.key(),
    };
  }

  enabled(): boolean {
    return true;
  }
}

/**
 * Filter tickets by claim status: is:assigned, is:unassigned (staff only).
 */
export class AssignedGroupedGambit implements IGambit<GambitType.Grouped> {
  type = GambitType.Grouped;
  predicates = false;

  key(): string[] {
    return ['unassigned', 'assigned'];
  }

  filterKey(): string {
    return 'assigned';
  }

  booleanKey(): 'is' | 'has' | 'allows' {
    return 'is';
  }

  groupKey(): string {
    return (app.translator && app.translator.trans('core.lib.gambits.group_keys.' + this.booleanKey(), {}, true)) || 'is';
  }

  pattern(): string {
    const is = this.groupKey();
    return `${is}:(unassigned|assigned)`;
  }

  toFilter(matches: string[], negate: boolean): Record<string, any> {
    const key = (negate ? '-' : '') + this.filterKey();
    const val = matches[1] === 'unassigned' ? 'none' : 'assigned';
    return {
      [key]: val,
    };
  }

  fromFilter(value: any, negate: boolean): string {
    const is = this.groupKey();
    if (value === 'none' || value === 'unassigned') {
      return `${negate ? '-' : ''}${is}:unassigned`;
    }
    if (value === 'assigned') {
      return `${negate ? '-' : ''}${is}:assigned`;
    }
    return '';
  }

  suggestion(): GroupedGambitSuggestion {
    return {
      group: this.groupKey(),
      key: this.key(),
    };
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

function safeTrans(key: string, fallback: string): string {
  const fullKey = 'linkrobins-support.lib.gambits.tickets.' + key;
  return ((app.translator as any)?.translations?.[fullKey] && app.translator.trans(fullKey, {}, true)) || fallback;
}

/**
 * Key-value assignee filter: assigned:me or assigned:none (staff only).
 */
export class AssignedGambit extends KeyValueGambit {
  key(): string {
    return safeTrans('assigned.key', 'assigned');
  }

  hint(): string {
    return safeTrans('assigned.hint', 'me or none');
  }

  filterKey(): string {
    return 'assigned';
  }

  pattern(): string {
    return `${this.key()}:(me|none)`;
  }

  toFilter(matches: string[], negate: boolean): Record<string, any> {
    const key = (negate ? '-' : '') + this.filterKey();
    return {
      [key]: matches[1],
    };
  }

  fromFilter(value: any, negate: boolean): string {
    if (value === 'me') {
      return `${negate ? '-' : ''}${this.key()}:me`;
    }
    if (value === 'none') {
      return `${negate ? '-' : ''}${this.key()}:none`;
    }
    return '';
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

/**
 * Staff-only filter for own filed tickets: is:mine.
 */
export class MineGambit extends BooleanGambit {
  key(): string {
    return safeTrans('mine.key', 'mine');
  }

  filterKey(): string {
    return 'mine';
  }

  toFilter(_matches: string[], negate: boolean): Record<string, any> {
    const key = (negate ? '-' : '') + this.filterKey();
    return {
      [key]: '1',
    };
  }

  fromFilter(_value: any, negate: boolean): string {
    const is = this.groupKey();
    return `${negate ? '-' : ''}${is}:${this.key()}`;
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

/**
 * Filter tickets by ticket type driver: type:standard, type:appeal, etc.
 */
export class TicketTypeGambit extends KeyValueGambit {
  key(): string {
    return safeTrans('type.key', 'type');
  }

  hint(): string {
    return safeTrans('type.hint', 'standard, appeal, or custom type');
  }

  filterKey(): string {
    return 'ticketType';
  }
}

/**
 * Staff-only filter for tickets opened by a specific username: author:<username>.
 */
export class AuthorGambit extends KeyValueGambit {
  key(): string {
    return safeTrans('author.key', 'author');
  }

  hint(): string {
    return safeTrans('author.hint', 'username');
  }

  filterKey(): string {
    return 'author';
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

/**
 * Staff-only filter for tickets by priority: priority:urgent, priority:normal, priority:low.
 */
export class PriorityGambit extends KeyValueGambit {
  key(): string {
    return safeTrans('priority.key', 'priority');
  }

  hint(): string {
    return safeTrans('priority.hint', 'urgent, normal, or low');
  }

  filterKey(): string {
    return 'priority';
  }

  valuePattern(): string {
    return '(urgent|normal|low|Urgent|Normal|Low)';
  }

  gambitValueToFilterValue(value: string): string {
    return value.toLowerCase();
  }

  fromFilter(value: any, negate: boolean): string {
    if (typeof value === 'string') {
      return `${negate ? '-' : ''}${this.key()}:${value}`;
    }
    return '';
  }

  enabled(): boolean {
    return canHandleSupportTickets();
  }
}

/**
 * Filter tickets by category slug: category:<slug> or cat:<slug>.
 */
export class CategoryGambit extends KeyValueGambit {
  key(): string {
    return safeTrans('category.key', 'category');
  }

  hint(): string {
    return safeTrans('category.hint', 'slug');
  }

  filterKey(): string {
    return 'category';
  }

  pattern(): string {
    const key = this.key();
    return `(?:${key}|cat):([a-zA-Z0-9_-]+)`;
  }

  toFilter(matches: string[], negate: boolean): Record<string, any> {
    const key = (negate ? '-' : '') + this.filterKey();
    return {
      [key]: matches[1],
    };
  }

  fromFilter(value: any, negate: boolean): string {
    if (typeof value === 'string') {
      return `${negate ? '-' : ''}${this.key()}:${value}`;
    }
    return '';
  }
}

/**
 * Register support ticket gambits with Flarum's frontend GambitManager.
 * Appends without duplicate registration to preserve third-party extensibility.
 */
export function registerTicketGambits(): void {
  if (app.search && app.search.gambits) {
    app.search.gambits.gambits[SUPPORT_TICKETS_RESOURCE] ||= [];
    const registry = app.search.gambits.gambits[SUPPORT_TICKETS_RESOURCE];
    const defaultGambits = [
      StatusGambit,
      AssignedGroupedGambit,
      AssignedGambit,
      MineGambit,
      PriorityGambit,
      CategoryGambit,
      TicketTypeGambit,
      AuthorGambit,
    ];
    for (const gambit of defaultGambits) {
      if (!registry.includes(gambit)) {
        registry.push(gambit);
      }
    }
  }
}
