import app from 'flarum/admin/app';

// --- Category CRUD via the store ----------------------------------------

export function loadCategoriesList(): Promise<any> {
  // defaultAssignee is not a server-side default include (the forum's public
  // category list has no business carrying it), so the admin page asks for it.
  return app.store.find('linkrobins-support-categories', {
    sort: 'position',
    page: { limit: 100 },
    include: 'defaultAssignee',
  });
}

export function saveCategory(category: any, attrs: Record<string, any>): Promise<any> {
  // An existing model patches itself; a null/new one creates a fresh record.
  const record = category || app.store.createRecord('linkrobins-support-categories');
  return record.save(attrs);
}

export function deleteCategory(category: any): Promise<any> {
  return category.delete();
}

/**
 * Everyone who can be a category's default assignee: administrators plus
 * anyone holding `lr-support.handle_tickets`. `filter[supportStaff]`
 * is served by the extension's StaffFilter on the core user list, and is
 * itself staff-gated.
 */
export function loadStaffUsers(): Promise<any> {
  return app.store.find('users', { filter: { supportStaff: '1' }, page: { limit: 100 }, sort: 'username' });
}
