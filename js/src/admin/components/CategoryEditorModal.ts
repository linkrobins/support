import app from 'flarum/admin/app';
import FormModal from 'flarum/common/components/FormModal';
import Form from 'flarum/common/components/Form';
import Button from 'flarum/common/components/Button';
import ColorPreviewInput from 'flarum/common/components/ColorPreviewInput';
import Select from 'flarum/common/components/Select';
import ItemList from 'flarum/common/utils/ItemList';
import extractText from 'flarum/common/utils/extractText';
import { saveCategory, deleteCategory, loadStaffUsers } from '../utils';
import { ticketTypes } from '../../common/ticketTypes';

/** See _assigneeOptions(): '' stays '', a user id becomes a non-numeric key. */
function optionKey(id: string | number | null): string {
  return id ? 'u' + id : '';
}

/**
 * Create/edit a support category. Built on core's FormModal so it matches the
 * Tags "New Tag" modal (a real <form>, Form-wrapped fields, a Form-controls
 * submit/delete row).
 */
export default class CategoryEditorModal extends FormModal<any> {
  category: any = null;
  editId: any = null;
  name = '';
  slug = '';
  description = '';
  color = '#07adcc';
  icon = 'fas fa-folder';
  position = 0;
  ticketType = 'standard';
  allowedGroupIds: string[] = [];
  // '' means nobody -- no auto-assign, all staff notified.
  defaultAssigneeId = '';
  staff: any[] = [];
  loadingStaff = true;
  staffError = false;
  saving = false;
  error: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    const category = this.attrs && this.attrs.category;
    this.category = category || null;
    this.editId = category ? category.id() : null;
    this.name = (category && category.name()) || '';
    this.slug = (category && category.slug()) || '';
    this.description = (category && category.description()) || '';
    this.color = (category && category.color()) || '#07adcc';
    this.icon = (category && category.icon()) || 'fas fa-folder';
    this.position = category && category.position() !== undefined ? category.position() : 0;
    this.ticketType = (category && category.ticketType && category.ticketType()) || 'standard';
    const allowed = category && category.attribute('allowedGroupIds');
    this.allowedGroupIds = Array.isArray(allowed) ? allowed.map(String) : [];
    const assignee = category && category.defaultAssignee && category.defaultAssignee();
    this.defaultAssigneeId = assignee ? String(assignee.id()) : '';
    this.saving = false;
    this.error = null;

    this.staff = [];
    this.loadingStaff = true;
    this.staffError = false;
    loadStaffUsers()
      .then((users: any[]) => {
        this.staff = users || [];
        this.loadingStaff = false;
        m.redraw();
      })
      .catch((err: any) => {
        // Not fatal: the select falls back to showing only the current value,
        // so an admin editing a category's colour is not blocked by it, and
        // saving keeps whoever was already configured.
        this.staffError = true;
        this.loadingStaff = false;
        console.error('[linkrobins/support] could not load staff list:', err);
        m.redraw();
      });
  }

  className() {
    // Flarum's default modal width (600px), not `Modal--small` (375px). The
    // tag editor this was modelled on is small because it holds three fields;
    // this one holds eight, and at 375px every label sat above a field barely
    // wider than its own help text.
    return 'LinkRobinsSupportCategoryEditorModal';
  }

  title() {
    return this.editId
      ? app.translator.trans('linkrobins-support.admin.category_editor.title_edit')
      : app.translator.trans('linkrobins-support.admin.category_editor.title_new');
  }

  fields(): ItemList<any> {
    const colorField = m(ColorPreviewInput, {
      className: 'FormControl',
      placeholder: '#07adcc',
      value: this.color,
      disabled: this.saving,
      oninput: (e: any) => {
        this.color = e.target.value;
      },
      onchange: (e: any) => {
        this.color = e.target.value;
      },
    });

    const items = new ItemList<any>();

    items.add(
      'name',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_name')),
        m('input', {
          type: 'text',
          className: 'FormControl',
          value: this.name,
          disabled: this.saving,
          oninput: (e: any) => {
            this.name = e.target.value;
          },
        }),
      ]),
      100
    );

    items.add(
      'slug',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_slug')),
        m('input', {
          type: 'text',
          className: 'FormControl',
          value: this.slug,
          placeholder: extractText(app.translator.trans('linkrobins-support.admin.category_editor.field_slug_placeholder')),
          disabled: this.saving,
          oninput: (e: any) => {
            this.slug = e.target.value;
          },
        }),
        m('div', { className: 'helpText' }, app.translator.trans('linkrobins-support.admin.category_editor.field_slug_help')),
      ]),
      90
    );

    items.add(
      'description',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_description')),
        m('textarea', {
          className: 'FormControl',
          rows: 3,
          value: this.description,
          disabled: this.saving,
          oninput: (e: any) => {
            this.description = e.target.value;
          },
        }),
      ]),
      80
    );

    items.add(
      'color',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_color')),
        colorField,
        m('div', { className: 'helpText' }, app.translator.trans('linkrobins-support.admin.category_editor.field_color_help')),
      ]),
      70
    );

    items.add(
      'icon',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_icon')),
        m('input', {
          type: 'text',
          className: 'FormControl',
          value: this.icon,
          disabled: this.saving,
          placeholder: 'fas fa-folder',
          oninput: (e: any) => {
            this.icon = e.target.value;
          },
        }),
        m('div', { className: 'helpText' }, app.translator.trans('linkrobins-support.admin.category_editor.field_icon_help')),
      ]),
      60
    );

    items.add(
      'position',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_position')),
        m('input', {
          type: 'number',
          className: 'FormControl',
          value: this.position,
          disabled: this.saving,
          oninput: (e: any) => {
            this.position = parseInt(e.target.value, 10) || 0;
          },
        }),
        m('div', { className: 'helpText' }, app.translator.trans('linkrobins-support.admin.category_editor.field_position_help')),
      ]),
      50
    );

    items.add(
      'ticketType',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_ticket_type')),
        m(Select, {
          value: this.ticketType,
          disabled: this.saving,
          options: this._ticketTypeOptions(),
          onchange: (value: string) => {
            this.ticketType = value;
          },
        }),
        m('div', { className: 'helpText' }, app.translator.trans('linkrobins-support.admin.category_editor.field_ticket_type_help')),
      ]),
      40
    );

    items.add(
      'defaultAssignee',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee')),
        m(Select, {
          value: optionKey(this.defaultAssigneeId),
          disabled: this.saving || this.loadingStaff,
          options: this._assigneeOptions(),
          onchange: (value: string) => {
            this.defaultAssigneeId = value ? String(value).replace(/^u/, '') : '';
          },
        }),
        this.staffError
          ? m('div', { className: 'helpText' }, app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee_error'))
          : m('div', { className: 'helpText' }, app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee_help')),
      ]),
      30
    );

    items.add(
      'allowedGroups',
      m('div', { className: 'Form-group' }, [
        m('label', null, app.translator.trans('linkrobins-support.admin.category_editor.field_allowed_groups')),
        m('div', { className: 'helpText' }, app.translator.trans('linkrobins-support.admin.category_editor.field_allowed_groups_help')),
        m(
          'div',
          { className: 'LinkRobinsSupport-groupCheckboxes' },
          ((app.store && app.store.all('groups')) || [])
            .filter((g: any) => g.id() !== '2') // Exclude Guest group
            .map((group: any) => {
              const id = String(group.id());
              const checked = this.allowedGroupIds.includes(id);
              return m('label.checkbox', [
                m('input', {
                  type: 'checkbox',
                  checked,
                  disabled: this.saving,
                  onchange: (e: any) => {
                    if (e.target.checked) {
                      if (!this.allowedGroupIds.includes(id)) {
                        this.allowedGroupIds.push(id);
                      }
                    } else {
                      this.allowedGroupIds = this.allowedGroupIds.filter((gid) => gid !== id);
                    }
                  },
                }),
                ' ',
                group.namePlural() || group.nameSingular() || id,
              ]);
            })
        ),
      ]),
      20
    );

    // Allow active ticket type driver to append custom category settings
    const driver = ticketTypes.get(this.ticketType);
    if (driver && driver.categoryFields) {
      driver.categoryFields(items, this);
    }

    items.add(
      'submit',
      m('div', { className: 'Form-group Form-controls' }, [
        m(
          Button,
          {
            type: 'submit',
            className: 'Button Button--primary',
            loading: this.saving,
            disabled: !this.name.trim(),
          },
          this.editId
            ? app.translator.trans('linkrobins-support.admin.category_editor.submit_update')
            : app.translator.trans('linkrobins-support.admin.category_editor.submit_create')
        ),

        this.editId
          ? m(
              'button',
              {
                type: 'button',
                className: 'Button LinkRobinsSupportCategoryEditorModal-delete',
                disabled: this.saving,
                onclick: () => {
                  this._delete();
                },
              },
              app.translator.trans('linkrobins-support.admin.categories.delete_button')
            )
          : null,
      ]),
      -100
    );

    return items;
  }

  content() {
    return m('div', { className: 'Modal-body' }, [
      this.error ? m('div', { className: 'Alert Alert--danger' }, this._errorMessage()) : null,
      m(Form, null, this.fields().toArray()),
    ]);
  }

  _ticketTypeOptions(): Record<string, string> {
    const opts: Record<string, string> = {};
    this._allTicketTypes().forEach((t: any) => {
      opts[t.id] = t.name || t.id;
    });
    return opts;
  }

  _allTicketTypes(): Array<{ id: string; name?: string; isAppeal?: boolean }> {
    return (
      (app.forum && app.forum.attribute('supportTicketTypes')) || [
        { id: 'standard', name: extractText(app.translator.trans('linkrobins-support.admin.ticket_types.standard')), isAppeal: false },
        { id: 'appeal', name: extractText(app.translator.trans('linkrobins-support.admin.ticket_types.appeal')), isAppeal: true },
      ]
    );
  }

  /**
   * Nobody, then every staff member. A user who is configured on this category
   * but is no longer staff would otherwise vanish from the list and silently
   * reset to "nobody" on the next save, so they are kept as a labelled option
   * -- the label is how an admin finds out the routing has gone stale.
   *
   * Keys are `u<id>`, not the bare id: JavaScript enumerates integer-like
   * object keys first, in numeric order, whatever order they were inserted
   * in -- which sorted "Nobody" (key '') to the bottom of the list, under
   * the staff. Prefixing keeps every key a plain string, so the order here
   * is the order rendered.
   */
  _assigneeOptions(): Record<string, string> {
    const options: Record<string, string> = {
      '': this.loadingStaff
        ? extractText(app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee_loading'))
        : extractText(app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee_none')),
    };

    this.staff.forEach((user: any) => {
      options[optionKey(user.id())] = user.displayName() || user.username();
    });

    const currentKey = optionKey(this.defaultAssigneeId);
    if (this.defaultAssigneeId && !options[currentKey] && !this.loadingStaff) {
      const current = this._currentAssignee();
      const name = (current && (current.displayName() || current.username())) || '#' + this.defaultAssigneeId;
      options[currentKey] = extractText(
        app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee_unavailable', { name })
      );
    }

    return options;
  }

  _currentAssignee(): any {
    const fromCategory = this.category && this.category.defaultAssignee && this.category.defaultAssignee();
    if (fromCategory) return fromCategory;
    try {
      return app.store.getById('users', this.defaultAssigneeId) || null;
    } catch (e) {
      return null;
    }
  }

  onsubmit(e: any) {
    if (e && e.preventDefault) e.preventDefault();
    if (this.saving || !this.name.trim()) return;
    this._save();
  }

  _errorMessage() {
    const err = this.error;
    if (!err) return extractText(app.translator.trans('linkrobins-support.admin.common.unknown_error'));
    try {
      const errors = err.response && err.response.errors;
      if (errors && errors[0]) {
        return errors[0].detail || errors[0].title || extractText(app.translator.trans('linkrobins-support.admin.rate_limits.error_save'));
      }
    } catch (e) {}
    return extractText(app.translator.trans('linkrobins-support.admin.category_editor.error_save'));
  }

  _save() {
    this.saving = true;
    this.error = null;
    m.redraw();

    const attrs: any = {
      name: this.name.trim(),
      description: this.description,
      color: this.color,
      icon: this.icon,
      position: this.position,
      ticketType: this.ticketType,
      allowedGroupIds: this.allowedGroupIds.length ? this.allowedGroupIds.map(Number) : null,
    };
    if (this.slug && this.slug.trim()) {
      attrs.slug = this.slug.trim();
    }

    const driver = ticketTypes.get(this.ticketType);
    if (driver && driver.categorySubmitData) {
      driver.categorySubmitData(attrs, this);
    }

    // Clearing is sent as the literal JSON:API payload `{ data: null }`, not
    // as `null`. Model.save() skips any relationship whose value is null
    // (`null !== value && ...`), so passing null leaves the field out of the
    // request entirely and the server keeps whoever was already configured --
    // "Nobody" looked like it saved and silently did nothing. Anything else is
    // run through Model.getIdentifier(), which maps this shape to `data: null`
    // and a model to its {type, id}.
    attrs.relationships = {
      defaultAssignee: this.defaultAssigneeId ? this._assigneeModel(this.defaultAssigneeId) : { data: null },
    };

    saveCategory(this.category, attrs)
      .then(() => {
        this.saving = false;
        try {
          if (this.attrs.onSaved) this.attrs.onSaved();
        } catch (e) {}
        try {
          app.modal.close();
        } catch (e) {}
      })
      .catch((err: any) => {
        this.saving = false;
        this.error = err;
        console.error('[linkrobins/support] save category failed:', err);
        m.redraw();
      });
  }

  _assigneeModel(id: string): any {
    for (let i = 0; i < this.staff.length; i++) {
      if (String(this.staff[i].id()) === String(id)) return this.staff[i];
    }
    return this._currentAssignee();
  }

  // Delete from within the editor (parity with the Tags "New Tag" modal).
  _delete() {
    if (!this.category || !this.editId) return;

    const name = this.category.name() || extractText(app.translator.trans('linkrobins-support.admin.categories.this_category'));
    const count = this.category.ticketCount() || 0;
    const warning =
      count > 0
        ? extractText(app.translator.trans('linkrobins-support.admin.categories.delete_confirm_with_tickets', { count }))
        : extractText(app.translator.trans('linkrobins-support.admin.categories.delete_confirm_named', { name }));
    try {
      if (!window.confirm(warning)) return;
    } catch (e) {}

    this.saving = true;
    this.error = null;
    m.redraw();

    deleteCategory(this.category)
      .then(() => {
        this.saving = false;
        try {
          if (this.attrs.onSaved) this.attrs.onSaved();
        } catch (e) {}
        try {
          app.modal.close();
        } catch (e) {}
      })
      .catch((err: any) => {
        this.saving = false;
        this.error = err;
        console.error('[linkrobins/support] delete category failed:', err);
        m.redraw();
      });
  }
}
