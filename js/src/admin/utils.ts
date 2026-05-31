// i18n helpers. t() returns whatever the translator returns (vdom or string);
// tx() always returns a plain string for attributes, alerts, and confirms.
export function t(key: string, params?: Record<string, any>): any {
  try {
    if (app && app.translator && typeof app.translator.trans === 'function') {
      return app.translator.trans(key, params || {});
    }
  } catch (e) {}
  return key;
}

export function tx(key: string, params?: Record<string, any>): string {
  try {
    if (app && app.translator && typeof app.translator.trans === 'function') {
      return app.translator.trans(key, params || {}, true);
    }
  } catch (e) {}
  return key;
}

export function showError(message: any): void {
  try {
    if (app && app.alerts && typeof app.alerts.show === 'function') {
      app.alerts.show({ type: 'error' }, message);
      return;
    }
  } catch (e) {}
  try {
    alert(message);
  } catch (e) {}
}

// --- Category CRUD via the store ----------------------------------------

export function loadCategoriesList(): Promise<any> {
  return app.store.find('linkrobins-support-categories', { sort: 'position', page: { limit: 100 } });
}

export function saveCategory(category: any, attrs: Record<string, any>): Promise<any> {
  // An existing model patches itself; a null/new one creates a fresh record.
  const record = category || app.store.createRecord('linkrobins-support-categories');
  return record.save(attrs);
}

export function deleteCategory(category: any): Promise<any> {
  return category.delete();
}
