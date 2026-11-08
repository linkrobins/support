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
  routingMode: 'all' | 'group' | 'user' | 'silent' = 'all';
  defaultAssigneeId = '';
  defaultAssignedGroupId = '';
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
    const isSilent = Boolean(category && (category.isSilent ? category.isSilent() : category.attribute('isSilent')));
    const assignee = category && category.defaultAssignee && category.defaultAssignee();
    this.defaultAssigneeId = assignee ? String(assignee.id()) : '';
    const group = category && category.defaultAssignedGroup && category.defaultAssignedGroup();
    this.defaultAssignedGroupId = group ? String(group.id()) : '';

    if (isSilent) {
      this.routingMode = 'silent';
    } else if (this.defaultAssignedGroupId) {
      this.routingMode = 'group';
    } else if (this.defaultAssigneeId) {
      this.routingMode = 'user';
    } else {
      this.routingMode = 'all';
    }

    this.saving = false;
    this.error = null;

    this.staff = [];
    this.loadingStaff = true;
    this.staffError = false;
    loadStaffUsers()
      .then((users: any[]) => {
        this.staff = users || [];
        this.loadingStaff = false;
        if (this.routingMode === 'user' && !this.defaultAssigneeId && this.staff.length > 0) {
          this.defaultAssigneeId = String(this.staff[0].id());
        }
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
    const colorField = (
      <ColorPreviewInput
        className="FormControl"
        placeholder="#07adcc"
        value={this.color}
        disabled={this.saving}
        oninput={(e: any) => {
          this.color = e.target.value;
        }}
        onchange={(e: any) => {
          this.color = e.target.value;
        }}
      />
    );

    const items = new ItemList<any>();

    items.add(
      'name',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_name')}</label>
        <input
          type="text"
          className="FormControl"
          value={this.name}
          disabled={this.saving}
          oninput={(e: any) => {
            this.name = e.target.value;
          }}
        />
      </div>,
      100
    );

    items.add(
      'slug',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_slug')}</label>
        <input
          type="text"
          className="FormControl"
          value={this.slug}
          placeholder={extractText(app.translator.trans('linkrobins-support.admin.category_editor.field_slug_placeholder'))}
          disabled={this.saving}
          oninput={(e: any) => {
            this.slug = e.target.value;
          }}
        />
        <div className="helpText">{app.translator.trans('linkrobins-support.admin.category_editor.field_slug_help')}</div>
      </div>,
      90
    );

    items.add(
      'description',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_description')}</label>
        <textarea
          className="FormControl"
          rows={3}
          value={this.description}
          disabled={this.saving}
          oninput={(e: any) => {
            this.description = e.target.value;
          }}
        />
      </div>,
      80
    );

    items.add(
      'color',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_color')}</label>
        {colorField}
        <div className="helpText">{app.translator.trans('linkrobins-support.admin.category_editor.field_color_help')}</div>
      </div>,
      70
    );

    items.add(
      'icon',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_icon')}</label>
        <input
          type="text"
          className="FormControl"
          value={this.icon}
          disabled={this.saving}
          placeholder="fas fa-folder"
          oninput={(e: any) => {
            this.icon = e.target.value;
          }}
        />
        <div className="helpText">{app.translator.trans('linkrobins-support.admin.category_editor.field_icon_help')}</div>
      </div>,
      60
    );

    items.add(
      'position',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_position')}</label>
        <input
          type="number"
          className="FormControl"
          value={this.position}
          disabled={this.saving}
          oninput={(e: any) => {
            this.position = parseInt(e.target.value, 10) || 0;
          }}
        />
        <div className="helpText">{app.translator.trans('linkrobins-support.admin.category_editor.field_position_help')}</div>
      </div>,
      50
    );

    items.add(
      'ticketType',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_ticket_type')}</label>
        <Select
          value={this.ticketType}
          disabled={this.saving}
          options={this._ticketTypeOptions()}
          onchange={(value: string) => {
            this.ticketType = value;
          }}
        />
        <div className="helpText">{app.translator.trans('linkrobins-support.admin.category_editor.field_ticket_type_help')}</div>
      </div>,
      40
    );

    items.add(
      'routingMode',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_routing_mode')}</label>
        <Select
          value={this.routingMode}
          disabled={this.saving}
          options={this._routingModeOptions()}
          onchange={(value: string) => {
            this._changeRoutingMode(value as any);
          }}
        />
        <div className="helpText">{this._routingHelpText()}</div>
      </div>,
      30
    );

    if (this.routingMode === 'group') {
      items.add(
        'routingTarget',
        <div className="Form-group">
          <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_target_group')}</label>
          <Select
            value={this.defaultAssignedGroupId}
            disabled={this.saving}
            options={this._groupOptions()}
            onchange={(value: string) => {
              this.defaultAssignedGroupId = value;
            }}
          />
        </div>,
        29
      );
    } else if (this.routingMode === 'user') {
      items.add(
        'routingTarget',
        <div className="Form-group">
          <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_target_user')}</label>
          <Select
            value={this.defaultAssigneeId}
            disabled={this.saving || this.loadingStaff}
            options={this._staffOptions()}
            onchange={(value: string) => {
              this.defaultAssigneeId = value;
            }}
          />
          {this.staffError && (
            <div className="helpText">{app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee_error')}</div>
          )}
        </div>,
        29
      );
    }

    items.add(
      'allowedGroups',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.admin.category_editor.field_allowed_groups')}</label>
        <div className="helpText">{app.translator.trans('linkrobins-support.admin.category_editor.field_allowed_groups_help')}</div>
        <div className="LinkRobinsSupport-groupCheckboxes">
          {((app.store && app.store.all('groups')) || [])
            .filter((g: any) => g.id() !== '2') // Exclude Guest group
            .map((group: any) => {
              const id = String(group.id());
              const checked = this.allowedGroupIds.includes(id);
              return (
                <label className="checkbox" key={id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={this.saving}
                    onchange={(e: any) => {
                      if (e.target.checked) {
                        if (!this.allowedGroupIds.includes(id)) {
                          this.allowedGroupIds.push(id);
                        }
                      } else {
                        this.allowedGroupIds = this.allowedGroupIds.filter((gid) => gid !== id);
                      }
                    }}
                  />{' '}
                  {group.namePlural() || group.nameSingular() || id}
                </label>
              );
            })}
        </div>
      </div>,
      20
    );

    // Allow active ticket type driver to append custom category settings
    const driver = ticketTypes.get(this.ticketType);
    if (driver && driver.categoryFields) {
      driver.categoryFields(items, this);
    }

    items.add(
      'submit',
      <div className="Form-group Form-controls">
        <Button type="submit" className="Button Button--primary" loading={this.saving} disabled={!this.name.trim()}>
          {this.editId
            ? app.translator.trans('linkrobins-support.admin.category_editor.submit_update')
            : app.translator.trans('linkrobins-support.admin.category_editor.submit_create')}
        </Button>

        {this.editId && (
          <Button
            type="button"
            className="Button LinkRobinsSupportCategoryEditorModal-delete"
            disabled={this.saving}
            onclick={() => {
              this._delete();
            }}
          >
            {app.translator.trans('linkrobins-support.admin.categories.delete_button')}
          </Button>
        )}
      </div>,
      -100
    );

    return items;
  }

  content() {
    return (
      <div className="Modal-body">
        {this.error && <div className="Alert Alert--danger">{this._errorMessage()}</div>}
        <Form>{this.fields().toArray()}</Form>
      </div>
    );
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

  _changeRoutingMode(mode: 'all' | 'group' | 'user' | 'silent') {
    this.routingMode = mode;
    if (mode === 'all' || mode === 'silent') {
      this.defaultAssigneeId = '';
      this.defaultAssignedGroupId = '';
    } else if (mode === 'group') {
      this.defaultAssigneeId = '';
      if (!this.defaultAssignedGroupId) {
        const groups = this._availableGroups();
        if (groups.length > 0) {
          this.defaultAssignedGroupId = String(groups[0].id());
        }
      }
    } else if (mode === 'user') {
      this.defaultAssignedGroupId = '';
      if (!this.defaultAssigneeId && this.staff.length > 0) {
        this.defaultAssigneeId = String(this.staff[0].id());
      }
    }
  }

  _routingModeOptions(): Record<string, string> {
    return {
      all: extractText(app.translator.trans('linkrobins-support.admin.category_editor.routing_mode_all')),
      group: extractText(app.translator.trans('linkrobins-support.admin.category_editor.routing_mode_group')),
      user: extractText(app.translator.trans('linkrobins-support.admin.category_editor.routing_mode_user')),
      silent: extractText(app.translator.trans('linkrobins-support.admin.category_editor.routing_mode_silent')),
    };
  }

  _routingHelpText(): string {
    switch (this.routingMode) {
      case 'group':
        return extractText(app.translator.trans('linkrobins-support.admin.category_editor.routing_mode_help_group'));
      case 'user':
        return extractText(app.translator.trans('linkrobins-support.admin.category_editor.routing_mode_help_user'));
      case 'silent':
        return extractText(app.translator.trans('linkrobins-support.admin.category_editor.routing_mode_help_silent'));
      default:
        return extractText(app.translator.trans('linkrobins-support.admin.category_editor.routing_mode_help_all'));
    }
  }

  _availableGroups(): any[] {
    return ((app.store && app.store.all('groups')) || []).filter((g: any) => g.id() !== '2' && g.id() !== '3');
  }

  _groupOptions(): Record<string, string> {
    const options: Record<string, string> = {};
    const groups = this._availableGroups();
    groups.forEach((g: any) => {
      options[String(g.id())] = g.namePlural() || g.nameSingular() || '#' + g.id();
    });

    if (this.defaultAssignedGroupId && !options[this.defaultAssignedGroupId]) {
      options[this.defaultAssignedGroupId] = extractText(
        app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee_unavailable', {
          name: '#' + this.defaultAssignedGroupId,
        })
      );
    }

    return options;
  }

  _staffOptions(): Record<string, string> {
    if (this.loadingStaff) {
      return {
        '': extractText(app.translator.trans('linkrobins-support.admin.category_editor.field_default_assignee_loading')),
      };
    }

    const options: Record<string, string> = {};
    this.staff.forEach((user: any) => {
      options[String(user.id())] = user.displayName() || user.username();
    });

    if (this.defaultAssigneeId && !options[this.defaultAssigneeId]) {
      const current = this._currentAssignee();
      const name = (current && (current.displayName() || current.username())) || '#' + this.defaultAssigneeId;
      options[this.defaultAssigneeId] = extractText(
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

    const isSilent = this.routingMode === 'silent';
    const assigneeId = this.routingMode === 'user' ? this.defaultAssigneeId : '';
    const groupId = this.routingMode === 'group' ? this.defaultAssignedGroupId : '';

    const attrs: any = {
      name: this.name.trim(),
      description: this.description,
      color: this.color,
      icon: this.icon,
      position: this.position,
      ticketType: this.ticketType,
      isSilent: isSilent,
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
      defaultAssignee: assigneeId ? this._assigneeModel(assigneeId) : { data: null },
      defaultAssignedGroup: groupId ? app.store.getById('groups', groupId) || { data: { type: 'groups', id: groupId } } : { data: null },
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
