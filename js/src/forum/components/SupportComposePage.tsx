import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import ItemList from 'flarum/common/utils/ItemList';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Button from 'flarum/common/components/Button';
import Icon from 'flarum/common/components/Icon';
import PageStructure from 'flarum/forum/components/PageStructure';
import extractText from 'flarum/common/utils/extractText';
import SupportIndexSidebar from './SupportIndexSidebar';
import SupportGuestPrompt from './SupportGuestPrompt';
import { BASE_PATH, showError, pushSupportHistory, isGuest } from '../utils/helpers';
import { isUserSuspended, supportAppealBanned } from '../utils/permissions';
import { loadCategories, createTicket, uploadFilesToBody } from '../utils/api';
import { supportComposerSupported, supportComposerOpenFor, openSupportComposer, supportComposerPreview } from '../utils/composer';
import { ticketTypes } from '../../common/ticketTypes';

export default class SupportComposePage extends Page {
  loading = true;
  saving = false;
  error: any = null;
  categories: any[] = [];
  subject = '';
  body = '';
  categoryId = '';
  uploadingCount = 0;
  uploadError: any = null;
  _composeFileInput: any = null;
  _composeComposer: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.loading = true;
    this.saving = false;
    this.error = null;
    this.categories = [];
    this.subject = '';
    this.body = '';
    this.categoryId = '';
    this.uploadingCount = 0;
    this.uploadError = null;
    try {
      app.setTitle(extractText(app.translator.trans('linkrobins-support.forum.index.new_ticket')));
    } catch (e) {}
    pushSupportHistory('linkrobins-support.compose', extractText(app.translator.trans('linkrobins-support.forum.index.new_ticket')));

    if (isGuest()) {
      this.loading = false;
      return;
    }

    this._loadCategories();
  }

  _loadCategories() {
    loadCategories()
      .then((cats: any[]) => {
        let list = cats || [];
        // Only show categories the current user is eligible to create tickets in
        list = list.filter((c: any) => !c.canCreate || c.canCreate() !== false);
        this.categories = list;
        // Only auto-select when there's a single category, so the picker (with
        // descriptions) is shown whenever there's a real choice to make.
        if (list.length === 1) {
          this.categoryId = String(list[0].id());
        }
        this.loading = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.error = err;
        this.loading = false;
        console.error('[linkrobins/support] categories load failed:', err);
        m.redraw();
      });
  }

  _wrap(inner: any) {
    return (
      <PageStructure
        className="IndexPage LinkRobinsSupport-page"
        // No filter is "active" on the compose page -- they're filing a new
        // ticket, not viewing a list. Pass null so all sidebar items render
        // as inactive.
        sidebar={() => <SupportIndexSidebar className="LinkRobinsSupport-sidebar" activeFilter={null} />}
      >
        {inner}
      </PageStructure>
    );
  }

  view() {
    if (isGuest()) {
      return this._wrap(
        <div className="LinkRobinsSupport-container">
          <header className="LinkRobinsSupport-header">
            <h1 className="LinkRobinsSupport-title">{app.translator.trans('linkrobins-support.forum.nav')}</h1>
          </header>
          <SupportGuestPrompt message={app.translator.trans('linkrobins-support.forum.guest.compose_message')} />
        </div>
      );
    }

    if (supportAppealBanned() && isUserSuspended()) {
      return this._wrap(
        <div className="LinkRobinsSupport-container">
          <header className="LinkRobinsSupport-header">
            <h1 className="LinkRobinsSupport-title">{app.translator.trans('linkrobins-support.forum.nav')}</h1>
          </header>
          <div className="LinkRobinsSupport-empty LinkRobinsSupport-empty--blocked">
            {app.translator.trans('linkrobins-support.forum.compose.appeal_banned')}
          </div>
        </div>
      );
    }

    if (this.loading) {
      return this._wrap(
        <div className="LinkRobinsSupport-container">
          <LoadingIndicator />
        </div>
      );
    }

    if (this.categories.length === 0) {
      return this._wrap(
        <div className="LinkRobinsSupport-container">
          <header className="LinkRobinsSupport-header">
            <h1 className="LinkRobinsSupport-title">{app.translator.trans('linkrobins-support.forum.nav')}</h1>
          </header>
          <div className="LinkRobinsSupport-empty">
            {isUserSuspended()
              ? app.translator.trans('linkrobins-support.forum.compose.no_appeal_categories')
              : app.translator.trans('linkrobins-support.forum.compose.no_categories')}
          </div>
        </div>
      );
    }

    // Step 1: a category picker showing each category's description. Shown
    // whenever no category has been chosen yet (more than one to choose from).
    if (this.categoryId === '') {
      return this._wrap(this._renderPicker());
    }

    return this._wrap(
      <div className="LinkRobinsSupport-container">
        {this._renderComposeHeader()}
        {this.error && (
          <div className="Alert Alert--danger">
            <span className="Alert-body">{this._errorMessage()}</span>
          </div>
        )}
        <div className="LinkRobinsSupport-form">{this.fields().toArray()}</div>
      </div>
    );
  }

  /**
   * The new-ticket form, as an ItemList so other extensions can add fields
   * of their own: subject (100), message (50) and, on installs without the
   * real composer, the submit row (-100). Anything added at the default
   * priority lands between the message and the submit button.
   *
   * With the real composer the message is the discussion-style "click to
   * write" box and the composer carries the submit button; without it, an
   * inline textarea with its own attach and submit row.
   */
  fields() {
    const items = new ItemList();

    items.add(
      'subject',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.forum.compose.subject_label')}</label>
        <input
          type="text"
          className="FormControl"
          value={this.subject}
          disabled={this.saving}
          placeholder={extractText(app.translator.trans('linkrobins-support.forum.compose.subject_placeholder'))}
          maxLength={200}
          oninput={(e: any) => {
            this.subject = e.target.value;
          }}
        />
      </div>,
      100
    );

    if (supportComposerSupported()) {
      const composerOpen = supportComposerOpenFor('new-ticket');

      items.add(
        'message',
        <div className="Form-group">
          <label>{app.translator.trans('linkrobins-support.forum.compose.message_label')}</label>
          <div className="LinkRobinsSupport-composePreview">
            {supportComposerPreview({
              composing: composerOpen,
              placeholder: app.translator.trans('linkrobins-support.forum.compose.message_placeholder_click'),
              onclick: () => this._openComposeComposer(),
            })}
          </div>
        </div>,
        50
      );

      return items;
    }

    const canSaveFallback = !this.saving && this.subject.trim() !== '' && this.body.trim() !== '' && this.categoryId !== '';

    items.add(
      'message',
      <div className="Form-group">
        <label>{app.translator.trans('linkrobins-support.forum.compose.message_label')}</label>
        <textarea
          className="FormControl LinkRobinsSupport-body"
          rows={10}
          value={this.body}
          disabled={this.saving}
          placeholder={extractText(app.translator.trans('linkrobins-support.forum.compose.body_placeholder'))}
          oninput={(e: any) => {
            this.body = e.target.value;
          }}
          onkeydown={(e: any) => {
            const isSubmit = (e.key === 'Enter' || e.keyCode === 13) && (e.ctrlKey || e.metaKey);
            if (isSubmit && canSaveFallback) {
              e.preventDefault();
              this._submit();
            }
          }}
        />
        {this.uploadError && <div className="Alert Alert--danger LinkRobinsSupport-uploadAlert">{this.uploadError}</div>}
        {this.uploadingCount > 0 && (
          <div className="LinkRobinsSupport-uploadStatus">
            {this.uploadingCount === 1
              ? app.translator.trans('linkrobins-support.forum.common.uploading_one')
              : app.translator.trans('linkrobins-support.forum.common.uploading_many', { count: this.uploadingCount })}
          </div>
        )}
      </div>,
      50
    );

    items.add(
      'actions',
      <div className="LinkRobinsSupport-form-actions">
        {app.forum && app.forum.attribute('fof-upload.canUpload') && (
          <span className="LinkRobinsSupport-attachBtnWrap">
            <Button
              className="Button Button--default LinkRobinsSupport-attachBtn"
              disabled={this.saving || this.uploadingCount > 0}
              onclick={() => {
                if (this._composeFileInput) this._composeFileInput.click();
              }}
              icon="fas fa-paperclip"
            >
              {app.translator.trans('linkrobins-support.forum.action.attach_files')}
            </Button>
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              disabled={this.saving || this.uploadingCount > 0}
              oncreate={(vnode: any) => {
                this._composeFileInput = vnode.dom;
              }}
              onremove={() => {
                this._composeFileInput = null;
              }}
              onchange={(e: any) => {
                const files = e.target.files;
                if (files && files.length) {
                  this._uploadFiles(files);
                }
                try {
                  e.target.value = '';
                } catch (err) {}
              }}
            />
          </span>
        )}
        <Button
          className="Button Button--primary"
          disabled={!canSaveFallback}
          loading={this.saving}
          onclick={() => {
            this._submit();
          }}
        >
          {this.saving
            ? app.translator.trans('linkrobins-support.forum.compose.submitting')
            : app.translator.trans('linkrobins-support.forum.compose.submit')}
        </Button>
      </div>,
      -100
    );

    const cat = this._chosenCategory();
    if (cat) {
      const driver = ticketTypes.forCategory(cat);
      if (driver && driver.fields) {
        driver.fields(items, this);
      }
    }

    return items;
  }

  _renderComposeHeader() {
    return (
      <header className="LinkRobinsSupport-header">
        {this.categories.length > 1 && (
          <Button
            className="Button Button--link LinkRobinsSupport-backBtn"
            disabled={this.saving}
            icon="fas fa-chevron-left"
            onclick={() => {
              this._backToCategories();
            }}
          >
            {app.translator.trans('linkrobins-support.forum.compose.back_to_categories')}
          </Button>
        )}
        <h1 className="LinkRobinsSupport-title">
          {this._isAppealOnly()
            ? app.translator.trans('linkrobins-support.forum.compose.title_appeal')
            : app.translator.trans('linkrobins-support.forum.compose.title')}
        </h1>
        {this._renderChosenCategory()}
      </header>
    );
  }

  _isAppealOnly(): boolean {
    const chosen = this._chosenCategory();
    if (chosen) {
      return !!(chosen.isAppeal && chosen.isAppeal());
    }
    return this.categories.length > 0 && this.categories.every((c: any) => !!(c.isAppeal && c.isAppeal()));
  }

  // Open the docked composer to write the ticket. A single native "Submit
  // ticket" action creates the ticket (subject lives on the page).
  _openComposeComposer() {
    const cat = this._chosenCategory();
    openSupportComposer({
      supportContext: 'new-ticket',
      className: 'LinkRobinsSupport-ticketComposer',
      placeholder: extractText(app.translator.trans('linkrobins-support.forum.compose.body_placeholder')),
      submitLabel: extractText(app.translator.trans('linkrobins-support.forum.compose.submit')),
      confirmExit: extractText(app.translator.trans('linkrobins-support.forum.compose.discard_confirm')),
      originalContent: this.body || '',
      supportHeaderItems: () => [
        {
          name: 'title',
          content: (
            <h3 className="LinkRobinsSupport-composerTitle">
              <Icon name={(cat && cat.icon()) || 'fas fa-life-ring'} />{' '}
              {this.subject || app.translator.trans('linkrobins-support.forum.compose.title')}
              {cat && cat.name() && <span className="LinkRobinsSupport-composerTitle-cat">{' · ' + cat.name()}</span>}
            </h3>
          ),
        },
      ],
      onSupportSubmit: (content: string, body: any) => {
        this._submit(content, body);
      },
    });
  }

  // Step 1: clickable category cards (icon + name + description).
  _renderPicker() {
    const appeal = this._isAppealOnly();
    return (
      <div className="LinkRobinsSupport-container">
        <header className="LinkRobinsSupport-header LinkRobinsSupport-header--picker">
          <h1 className="LinkRobinsSupport-title">
            {appeal
              ? app.translator.trans('linkrobins-support.forum.compose.title_appeal')
              : app.translator.trans('linkrobins-support.forum.compose.title')}
          </h1>
          <p className="LinkRobinsSupport-pickerHint">
            {appeal
              ? app.translator.trans('linkrobins-support.forum.compose.choose_category_appeal')
              : app.translator.trans('linkrobins-support.forum.compose.choose_category')}
          </p>
        </header>
        <ul className="LinkRobinsSupport-categoryCards">
          {this.categories.map((c: any) => {
            const color = c.color() || null;
            return (
              <li className="LinkRobinsSupport-categoryCards-item" key={c.id()}>
                <Button
                  className="LinkRobinsSupport-categoryCard"
                  onclick={() => {
                    this._chooseCategory(String(c.id()));
                  }}
                >
                  <span className="LinkRobinsSupport-categoryCard-icon" style={color ? { color } : undefined}>
                    <Icon name={c.icon() || 'fas fa-life-ring'} />
                  </span>
                  <span className="LinkRobinsSupport-categoryCard-text">
                    <span className="LinkRobinsSupport-categoryCard-name">{c.name() || ''}</span>
                    {c.description() && <span className="LinkRobinsSupport-categoryCard-desc">{c.description()}</span>}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // The selected-category chip shown in the form header (step 2).
  _renderChosenCategory() {
    const c = this._chosenCategory();
    if (!c) return null;
    const color = c.color() || null;
    return (
      <div className="LinkRobinsSupport-chosenCategory">
        {c.icon() && <Icon name={c.icon()} className="LinkRobinsSupport-chosenCategory-icon" style={color ? { color } : undefined} />}
        <span className="LinkRobinsSupport-chosenCategory-name">{c.name() || ''}</span>
      </div>
    );
  }

  _chosenCategory() {
    const id = String(this.categoryId);
    for (let i = 0; i < this.categories.length; i++) {
      if (String(this.categories[i].id()) === id) return this.categories[i];
    }
    return null;
  }

  _chooseCategory(id: string) {
    this.categoryId = id;
    this.error = null;
    m.redraw();
  }

  _backToCategories() {
    this.categoryId = '';
    this.error = null;
    // Close the docked composer if it's open for this draft.
    try {
      if (supportComposerOpenFor('new-ticket') && app.composer && app.composer.close) {
        app.composer.close();
      }
    } catch (e) {}
    m.redraw();
  }

  _errorMessage() {
    const err = this.error;
    if (!err) return app.translator.trans('linkrobins-support.forum.errors.unknown');
    try {
      const errors = err.response && err.response.errors;
      if (errors && errors[0]) {
        return errors[0].detail || errors[0].title || app.translator.trans('linkrobins-support.forum.errors.submit');
      }
    } catch (e) {}
    return app.translator.trans('linkrobins-support.forum.errors.submit_ticket');
  }

  /**
   * Builds the payload dictionary sent to createTicket(). Extensions can extend
   * this method with extend() to attach custom attributes or relationships.
   */
  submitData(content?: string): Record<string, any> {
    const bodyText = typeof content === 'string' ? content : this.body;
    const category = this._chosenCategory();

    const data: Record<string, any> = {
      subject: this.subject.trim(),
      firstPost: bodyText,
      relationships: { category },
    };

    if (category) {
      const driver = ticketTypes.forCategory(category);
      if (driver && driver.submitData) {
        driver.submitData(data, this);
      }
    }

    return data;
  }

  // Create the ticket. Called from the docked composer with (content, body),
  // or from the fallback page button with no args (it reads this.body).
  _submit(content?: string, body?: any) {
    const bodyText = typeof content === 'string' ? content : this.body;
    const category = this._chosenCategory();

    if (this.subject.trim() === '' || this.categoryId === '' || !category) {
      showError(app.translator.trans('linkrobins-support.forum.compose.subject_first'));
      return;
    }
    if (!bodyText || bodyText.trim() === '') {
      showError(app.translator.trans('linkrobins-support.forum.errors.empty_body'));
      return;
    }

    const data = this.submitData(content);

    if (category) {
      const driver = ticketTypes.forCategory(category);
      if (driver && driver.validate) {
        const error = driver.validate(data, this);
        if (error) {
          showError(typeof error === 'string' ? error : app.translator.trans('linkrobins-support.forum.compose.validation_failed'));
          return;
        }
      }
    }

    this.saving = true;
    this.error = null;
    if (body) body.loading = true;
    m.redraw();

    createTicket(data)
      .then((ticket: any) => {
        this.saving = false;
        this.body = '';
        if (body && body.composer) body.composer.hide();
        if (ticket && ticket.id()) {
          m.route.set(BASE_PATH + '/' + encodeURIComponent(ticket.id()));
        } else {
          m.route.set(BASE_PATH);
        }
      })
      .catch((err: any) => {
        this.saving = false;
        if (body) body.loading = false;
        this.error = err;
        console.error('[linkrobins/support] submit failed:', err);
        m.redraw();
      });
  }

  _uploadFiles(files: FileList) {
    return uploadFilesToBody(this, files, 'body', () => this._composeComposer && this._composeComposer.editor);
  }
}
