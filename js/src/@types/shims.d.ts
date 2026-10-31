import type { TicketTypeRegistry } from '../common/ticketTypes';

declare module 'flarum/common/Application' {
  export default interface Application {
    support?: { ticketTypes: TicketTypeRegistry };
  }
}
