import SupportCategory from './common/models/SupportCategory';
import SupportAdminPage from './admin/components/SupportAdminPage';
import { tx } from './admin/utils';

app.initializers.add('linkrobins-support', () => {
  app.store.models['linkrobins-support-categories'] = SupportCategory;

  if (!app.registry || typeof app.registry.for !== 'function') {
    console.warn('[linkrobins/support] app.registry not available');
    return;
  }
  app.registry.for('linkrobins-support').registerPage(SupportAdminPage);

  try {
    if (typeof app.registry.registerPermission === 'function') {
      app.registry.registerPermission(
        {
          permission: 'linkrobins-support.handle_tickets',
          icon: 'fas fa-life-ring',
          label: tx('linkrobins-support.admin.permissions.handle_tickets'),
        },
        'moderate',
        95
      );
      app.registry.registerPermission(
        {
          permission: 'linkrobins-support.manage_appeal_bans',
          icon: 'fas fa-ban',
          label: tx('linkrobins-support.admin.permissions.manage_appeal_bans'),
        },
        'moderate',
        94
      );
      app.registry.registerPermission(
        {
          permission: 'linkrobins-support.force_delete_tickets',
          icon: 'fas fa-trash',
          label: tx('linkrobins-support.admin.permissions.force_delete_tickets'),
        },
        'moderate',
        93
      );
    }
  } catch (e) {
    console.warn('[linkrobins/support] could not register permission:', e);
  }
});
