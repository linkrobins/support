import ItemList from 'flarum/common/utils/ItemList';

export interface TicketTypeClientDriver {
  id: string;
  name?(): string;
  fields?(items: ItemList<any>, context: any): void;
  submitData?(data: Record<string, any>, context: any): void;
  validate?(data: Record<string, any>, context: any): string | boolean | void;
  contentItems?(items: ItemList<any>, ticket: any): void;
  metaItems?(items: ItemList<any>, ticket: any): void;
  actionItems?(items: ItemList<any>, ticket: any): void;
  decisionItems?(items: ItemList<any>, ticket: any): void;
}

export class TicketTypeRegistry {
  private drivers = new Map<string, TicketTypeClientDriver>();

  register(driver: TicketTypeClientDriver): void {
    this.drivers.set(driver.id, driver);
  }

  get(id: string): TicketTypeClientDriver | undefined {
    return this.drivers.get(id);
  }

  has(id: string): boolean {
    return this.drivers.has(id);
  }

  all(): TicketTypeClientDriver[] {
    return Array.from(this.drivers.values());
  }
}

export const ticketTypes = new TicketTypeRegistry();

// Register built-in ticket types as living examples for other extensions
ticketTypes.register({
  id: 'standard',
  name: () => app.translator.trans('linkrobins-support.admin.ticket_types.standard'),
});

ticketTypes.register({
  id: 'appeal',
  name: () => app.translator.trans('linkrobins-support.admin.ticket_types.appeal'),
});
