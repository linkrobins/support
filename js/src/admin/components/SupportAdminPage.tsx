import app from 'flarum/admin/app';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Button from 'flarum/common/components/Button';
import Icon from 'flarum/common/components/Icon';
import Switch from 'flarum/common/components/Switch';
import Form from 'flarum/common/components/Form';
import FormSectionGroup from 'flarum/admin/components/FormSectionGroup';
import FormSection from 'flarum/admin/components/FormSection';
import extractText from 'flarum/common/utils/extractText';
import CategoryEditorModal from './CategoryEditorModal';
import SavedReplyEditorModal from './SavedReplyEditorModal';
import AppealBannedUsersModal from './AppealBannedUsersModal';
import { loadCategoriesList } from '../utils';

export default class SupportAdminPage extends ExtensionPage {
  categories: any[] = [];
  loadingCats = true;
  catError: any = null;
  savedReplies: any[] = [];
  loadingReplies = true;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.categories = [];
    this.loadingCats = true;
    this.catError = null;
    this._loadCategories();
    this._loadSavedReplies();
  }

  _loadSavedReplies() {
    this.loadingReplies = true;
    app.store
      .find('linkrobins-support-saved-replies', { page: { limit: 200 } })
      .then((replies: any) => {
        this.savedReplies = replies || [];
        this.loadingReplies = false;
        m.redraw();
      })
      .catch(() => {
        this.loadingReplies = false;
        m.redraw();
      });
  }

  _renderSavedRepliesSection() {
    const open = (reply: any) => app.modal.show(SavedReplyEditorModal, { reply, onSaved: () => this._loadSavedReplies() });

    return [
      <p className="helpText">{app.translator.trans('linkrobins-support.admin.saved_replies.intro')}</p>,
      this.loadingReplies ? (
        <LoadingIndicator />
      ) : this.savedReplies.length === 0 ? (
        <div className="LinkRobinsSupportAdmin-empty">{app.translator.trans('linkrobins-support.admin.saved_replies.empty')}</div>
      ) : (
        <div className="LinkRobinsSupportAdmin-tableWrap">
          <table className="LinkRobinsSupportAdmin-catTable">
            <tbody>
              {this.savedReplies.map((r: any) => (
                <tr key={'saved-' + r.id()}>
                  <td>
                    <strong>{r.title()}</strong>
                  </td>
                  <td className="LinkRobinsSupportAdmin-savedPreview">
                    {(r.content() || '').slice(0, 90) + ((r.content() || '').length > 90 ? '…' : '')}
                  </td>
                  <td className="LinkRobinsSupportAdmin-actions">
                    <Button className="Button" icon="fas fa-pencil-alt" onclick={() => open(r)}>
                      {app.translator.trans('linkrobins-support.admin.saved_replies.edit_button')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
      <Button className="Button" icon="fas fa-plus" onclick={() => open(null)}>
        {app.translator.trans('linkrobins-support.admin.saved_replies.new_button')}
      </Button>,
    ];
  }

  _loadCategories() {
    this.loadingCats = true;
    m.redraw();
    loadCategoriesList()
      .then((cats: any[]) => {
        this.categories = cats || [];
        this.loadingCats = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.catError = err;
        this.loadingCats = false;
        console.error('[linkrobins/support] categories load failed:', err);
        m.redraw();
      });
  }

  // Render the page using Flarum's standard ExtensionPage scaffolding: a
  // FormSectionGroup of stacked, labelled FormSections -- the same layout the
  // core Tags extension admin page uses.
  content() {
    return (
      <div className="ExtensionPage-settings LinkRobinsSupportAdmin">
        <div className="container">
          <FormSectionGroup>
            <FormSection label={app.translator.trans('linkrobins-support.admin.categories.heading')}>{this._renderCategoriesSection()}</FormSection>
            <FormSection label={app.translator.trans('linkrobins-support.admin.saved_replies.heading')}>
              {this._renderSavedRepliesSection()}
            </FormSection>
            <FormSection label={app.translator.trans('linkrobins-support.admin.navigation.heading')}>{this._renderNavigationSection()}</FormSection>
            <FormSection label={app.translator.trans('linkrobins-support.admin.auto_close.heading')}>{this._renderAutoCloseSection()}</FormSection>
            <FormSection label={app.translator.trans('linkrobins-support.admin.rate_limits.heading')}>{this._renderSettingsSection()}</FormSection>
            <FormSection label={app.translator.trans('linkrobins-support.admin.appeal_bans.heading_alt')}>
              {this._renderAppealBansSection()}
            </FormSection>
          </FormSectionGroup>
        </div>
      </div>
    );
  }

  _renderCategoriesSection() {
    return [
      <p className="helpText">{app.translator.trans('linkrobins-support.admin.categories.intro')}</p>,
      this.catError ? <div className="Alert Alert--danger">{app.translator.trans('linkrobins-support.admin.category_editor.error_load')}</div> : null,
      this.loadingCats ? (
        <LoadingIndicator />
      ) : this.categories.length === 0 ? (
        <div className="LinkRobinsSupportAdmin-empty">{app.translator.trans('linkrobins-support.admin.categories.empty')}</div>
      ) : (
        <div className="LinkRobinsSupportAdmin-tableWrap">
          <table className="LinkRobinsSupportAdmin-catTable">
            <thead>
              <tr>
                <th>{app.translator.trans('linkrobins-support.admin.categories.column_name')}</th>
                <th>{app.translator.trans('linkrobins-support.admin.categories.column_type')}</th>
                <th>{app.translator.trans('linkrobins-support.admin.categories.column_assignee')}</th>
                <th>{app.translator.trans('linkrobins-support.admin.categories.column_tickets')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {this.categories.map((c: any) => (
                <tr key={'cat-' + c.id()}>
                  <td>
                    {c.icon() ? <Icon name={c.icon()} style={c.color() ? { color: c.color() } : undefined} /> : null} <strong>{c.name()}</strong>
                  </td>
                  <td>{this._typeLabel(c)}</td>
                  <td>{this._assigneeLabel(c)}</td>
                  <td>{c.ticketCount() || 0}</td>
                  <td className="LinkRobinsSupportAdmin-actions">
                    <Button
                      className="Button"
                      icon="fas fa-pencil-alt"
                      title={extractText(app.translator.trans('linkrobins-support.admin.categories.edit_button'))}
                      onclick={() => this._openEditor(c)}
                    >
                      {app.translator.trans('linkrobins-support.admin.categories.edit_button')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
      <Button className="Button" icon="fas fa-plus" onclick={() => this._openEditor(null)}>
        {app.translator.trans('linkrobins-support.admin.categories.new_button')}
      </Button>,
    ];
  }

  /**
   * Who a category routes to, or a muted "all staff" when it routes to nobody
   * -- an empty cell would read as missing data rather than as the default.
   */
  _assigneeLabel(category: any) {
    const user = category.defaultAssignee && category.defaultAssignee();
    if (!user) {
      return (
        <span className="LinkRobinsSupportAdmin-noAssignee">{app.translator.trans('linkrobins-support.admin.categories.assignee_all_staff')}</span>
      );
    }
    return user.displayName() || user.username();
  }

  _typeLabel(category: any) {
    const typeId = (category.ticketType && category.ticketType()) || 'standard';
    const types = (app.forum && app.forum.attribute<any[]>('supportTicketTypes')) || [];
    const matched = types.find((t: any) => t.id === typeId);
    if (matched && matched.name) {
      return <span className="badge">{matched.name}</span>;
    }
    return (
      <span className="badge">
        {typeId === 'appeal'
          ? app.translator.trans('linkrobins-support.admin.categories.appeal_badge')
          : app.translator.trans('linkrobins-support.admin.categories.general_badge')}
      </span>
    );
  }

  _openEditor(category: any) {
    if (!app.modal) return;
    app.modal.show(CategoryEditorModal, {
      category,
      onSaved: () => {
        this._loadCategories();
      },
    });
  }

  // --- Settings section ---

  _renderNavigationSection() {
    const switches = [
      {
        key: 'linkrobins-support.nav_in_sidebar',
        labelKey: 'linkrobins-support.admin.navigation.in_sidebar',
        helpKey: 'linkrobins-support.admin.navigation.in_sidebar_help',
        fallback: true,
      },
      {
        key: 'linkrobins-support.nav_in_account_menu',
        labelKey: 'linkrobins-support.admin.navigation.in_account_menu',
        helpKey: 'linkrobins-support.admin.navigation.in_account_menu_help',
        fallback: true,
      },
      {
        key: 'linkrobins-support.forum_nav_on_support_pages',
        labelKey: 'linkrobins-support.admin.navigation.forum_nav',
        helpKey: 'linkrobins-support.admin.navigation.forum_nav_help',
        fallback: false,
      },
    ];

    return (
      <Form>
        <p className="helpText">{app.translator.trans('linkrobins-support.admin.navigation.intro')}</p>
        {switches.map((sw) => {
          // Read AND write the page's own setting stream. Reading app.data
          // instead leaves the input controlled by the saved value, so a click
          // is undone by the very next redraw and the switch looks dead.
          const value = this.setting(sw.key, sw.fallback ? '1' : '0');

          return (
            <div className="Form-group" key={sw.key}>
              <Switch
                state={!(value() === '' || value() === '0')}
                onchange={(val: boolean) => {
                  value(val ? '1' : '0');
                }}
              >
                {app.translator.trans(sw.labelKey)}
              </Switch>
              <div className="helpText">{app.translator.trans(sw.helpKey)}</div>
            </div>
          );
        })}
        <div className="Form-group Form-controls">{this.submitButton()}</div>
      </Form>
    );
  }

  _renderSettingsSection() {
    const fields = [
      {
        key: 'linkrobins-support.appeal_limit_per_window',
        labelKey: 'linkrobins-support.admin.rate_limits.max_appeals_per_window',
        helpKey: 'linkrobins-support.admin.rate_limits.max_appeals_per_window_help',
        min: 1,
        defaultValue: '3',
      },
      {
        key: 'linkrobins-support.appeal_window_days',
        labelKey: 'linkrobins-support.admin.rate_limits.appeal_window_days',
        helpKey: 'linkrobins-support.admin.rate_limits.appeal_window_days_help',
        min: 1,
        defaultValue: '30',
      },
      {
        key: 'linkrobins-support.appeal_max_concurrent_open',
        labelKey: 'linkrobins-support.admin.rate_limits.max_concurrent_appeals',
        helpKey: 'linkrobins-support.admin.rate_limits.max_concurrent_appeals_help',
        min: 0,
        defaultValue: '1',
      },
      {
        key: 'linkrobins-support.general_limit_per_window',
        labelKey: 'linkrobins-support.admin.rate_limits.max_general_per_window',
        helpKey: 'linkrobins-support.admin.rate_limits.max_general_per_window_help',
        min: 1,
        defaultValue: '10',
      },
      {
        key: 'linkrobins-support.general_window_hours',
        labelKey: 'linkrobins-support.admin.rate_limits.general_window_hours',
        helpKey: 'linkrobins-support.admin.rate_limits.general_window_hours_help',
        min: 1,
        defaultValue: '24',
      },
    ];

    return (
      <Form>
        <p className="helpText">{app.translator.trans('linkrobins-support.admin.rate_limits.intro')}</p>
        {fields.map((f) => (
          <div className="Form-group" key={f.key}>
            <label>{app.translator.trans(f.labelKey)}</label>
            <input
              type="number"
              className="FormControl"
              min={f.min}
              // Same rule as the switches above: the stream is the live value.
              value={this.setting(f.key, f.defaultValue)()}
              oninput={(e: any) => {
                this.setting(f.key, f.defaultValue)(e.target.value);
              }}
            />
            <div className="helpText">{app.translator.trans(f.helpKey)}</div>
          </div>
        ))}
        <div className="Form-group Form-controls">{this.submitButton()}</div>
      </Form>
    );
  }

  _renderAutoCloseSection() {
    const key = 'linkrobins-support.auto_close_resolved_days';
    return (
      <Form>
        <p className="helpText">{app.translator.trans('linkrobins-support.admin.auto_close.intro')}</p>
        <div className="Form-group">
          <label>{app.translator.trans('linkrobins-support.admin.auto_close.days')}</label>
          <input
            type="number"
            className="FormControl"
            min={0}
            value={this.setting(key, '7')()}
            oninput={(e: any) => {
              this.setting(key, '7')(e.target.value);
            }}
          />
          <div className="helpText">{app.translator.trans('linkrobins-support.admin.auto_close.days_help')}</div>
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('linkrobins-support.admin.auto_close.reminder_days')}</label>
          <input
            type="number"
            className="FormControl"
            min={0}
            value={this.setting('linkrobins-support.awaiting_reminder_days', '3')()}
            oninput={(e: any) => {
              this.setting('linkrobins-support.awaiting_reminder_days', '3')(e.target.value);
            }}
          />
          <div className="helpText">{app.translator.trans('linkrobins-support.admin.auto_close.reminder_days_help')}</div>
        </div>
        <div className="Form-group Form-controls">{this.submitButton()}</div>
      </Form>
    );
  }

  _renderAppealBansSection() {
    return [
      <p className="helpText">{app.translator.trans('linkrobins-support.admin.appeal_bans.intro')}</p>,
      <Button
        className="Button"
        icon="fas fa-list"
        onclick={() => {
          if (app.modal) app.modal.show(AppealBannedUsersModal);
        }}
      >
        {app.translator.trans('linkrobins-support.admin.appeal_bans.view_banned_button')}
      </Button>,
    ];
  }
}
