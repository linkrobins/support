import ItemList from 'flarum/common/utils/ItemList';
import extractText from 'flarum/common/utils/extractText';

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
  badgeItems?(items: ItemList<any>, ticket: any): void;
  categoryFields?(items: ItemList<any>, modal: any): void;
  categorySubmitData?(data: Record<string, any>, modal: any): void;
}

export class TicketTypeRegistry {
  private drivers = new Map<string, TicketTypeClientDriver>();

  register(driver: TicketTypeClientDriver): void {
    this.drivers.set(driver.id, driver);
  }

  get(id: string): TicketTypeClientDriver | undefined {
    return this.drivers.get(id);
  }

  /**
   * The driver for a category's ticket type, if one is registered on the
   * client. Categories without a type are standard.
   */
  forCategory(category: any): TicketTypeClientDriver | undefined {
    if (!category) return undefined;
    const id = (category.ticketType && category.ticketType()) || 'standard';
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
  name: () => extractText(app.translator.trans('linkrobins-support.admin.ticket_types.standard')),
});

ticketTypes.register({
  id: 'appeal',
  name: () => extractText(app.translator.trans('linkrobins-support.admin.ticket_types.appeal')),
});

export default ticketTypes;
