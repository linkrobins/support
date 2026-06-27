import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import PageStructure from 'flarum/forum/components/PageStructure';
import SupportIndexSidebar from './SupportIndexSidebar';
import { tr } from '../utils/translate';
import { BASE_PATH, showError } from '../utils/helpers';
import { isUserSuspended, supportAppealBanned } from '../utils/permissions';
import { loadCategories, createTicket, uploadFilesToBody } from '../utils/api';
import { supportComposerSupported, supportComposerOpenFor, openSupportComposer, supportComposerPreview } from '../utils/composer';

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
      app.setTitle(tr('index.new_ticket', 'New ticket'));
    } catch (e) {}

    if (!app.session || !app.session.user) {
      m.route.set('/');
      return;
    }

    this._loadCategories();
  }

  _loadCategories() {
    loadCategories()
      .then((cats: any[]) => {
        let list = cats || [];
        // Banned users only see appeal categories.
        if (isUserSuspended()) {
          list = list.filter((c: any) => c.isAppeal() === true);
        }
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
    return m(
      PageStructure,
      {
        className: 'IndexPage LinkRobinsSupport-page',
        // No filter is "active" on the compose page -- they're filing a new
        // ticket, not viewing a list. Pass null so all sidebar items render
        // as inactive.
        sidebar: () => m(SupportIndexSidebar, { className: 'LinkRobinsSupport-sidebar', activeFilter: null }),
      },
      inner
    );
  }

  view() {
    if (supportAppealBanned() && isUserSuspended()) {
      return this._wrap(
        m('div', { className: 'LinkRobinsSupport-container' }, [
          m('header', { className: 'LinkRobinsSupport-header' }, m('h1', { className: 'LinkRobinsSupport-title' }, tr('nav', 'Support'))),
          m(
            'div',
            { className: 'LinkRobinsSupport-empty LinkRobinsSupport-empty--blocked' },
            tr('compose.appeal_banned', 'You are not permitted to file appeals. Please contact the site owner via another channel.')
          ),
        ])
      );
    }

    if (this.loading) {
      return this._wrap(m('div', { className: 'LinkRobinsSupport-container' }, m(LoadingIndicator)));
    }

    if (this.categories.length === 0) {
      return this._wrap(
        m('div', { className: 'LinkRobinsSupport-container' }, [
          m('header', { className: 'LinkRobinsSupport-header' }, m('h1', { className: 'LinkRobinsSupport-title' }, tr('nav', 'Support'))),
          m(
            'div',
            { className: 'LinkRobinsSupport-empty' },
            isUserSuspended()
              ? tr('compose.no_appeal_categories', 'No appeal categories are currently available.')
              : tr('compose.no_categories', 'No support categories have been set up yet. Please contact an admin.')
          ),
        ])
      );
    }

    // Step 1: a category picker showing each category's description. Shown
    // whenever no category has been chosen yet (more than one to choose from).
    if (this.categoryId === '') {
      return this._wrap(this._renderPicker());
    }

    const composerOpen = supportComposerOpenFor('new-ticket');

    // With the real composer: keep the subject field on the page and use the
    // same discussion-style "reply placeholder" box for the message.
    if (supportComposerSupported()) {
      return this._wrap(
        m('div', { className: 'LinkRobinsSupport-container' }, [
          this._renderComposeHeader(),
          this.error ? m('div', { className: 'Alert Alert--danger' }, [m('span', { className: 'Alert-body' }, this._errorMessage())]) : null,
          m('div', { className: 'LinkRobinsSupport-form' }, [
            m('div', { className: 'Form-group' }, [
              m('label', null, tr('compose.subject_label', 'Subject')),
              m('input', {
                type: 'text',
                className: 'FormControl',
                value: this.subject,
                disabled: this.saving,
                placeholder: tr('compose.subject_placeholder', 'Short summary of your issue'),
                maxlength: 200,
                oninput: (e: any) => {
                  this.subject = e.target.value;
                },
              }),
            ]),
            m('div', { className: 'Form-group' }, [
              m('label', null, tr('compose.message_label', 'Message')),
              m(
                'div',
                { className: 'LinkRobinsSupport-composePreview' },
                supportComposerPreview({
                  composing: composerOpen,
                  placeholder: tr('compose.message_placeholder_click', 'Click to write your message…'),
                  onclick: () => this._openComposeComposer(),
                })
              ),
            ]),
          ]),
        ])
      );
    }

    // Fallback (stripped install without the composer): full inline form.
    const canSaveFallback = !this.saving && this.subject.trim() !== '' && this.body.trim() !== '' && this.categoryId !== '';

    return this._wrap(
      m('div', { className: 'LinkRobinsSupport-container' }, [
        this._renderComposeHeader(),
        this.error ? m('div', { className: 'Alert Alert--danger' }, [m('span', { className: 'Alert-body' }, this._errorMessage())]) : null,
        m('div', { className: 'LinkRobinsSupport-form' }, [
          m('div', { className: 'Form-group' }, [
            m('label', null, tr('compose.subject_label', 'Subject')),
            m('input', {
              type: 'text',
              className: 'FormControl',
              value: this.subject,
              disabled: this.saving,
              placeholder: tr('compose.subject_placeholder', 'Short summary of your issue'),
              maxlength: 200,
              oninput: (e: any) => {
                this.subject = e.target.value;
              },
            }),
          ]),
          m('div', { className: 'Form-group' }, [
            m('label', null, tr('compose.message_label', 'Message')),
            m('textarea', {
              className: 'FormControl LinkRobinsSupport-body',
              rows: 10,
              value: this.body,
              disabled: this.saving,
              placeholder: tr('compose.body_placeholder', 'Describe the issue in detail. Markdown is supported.'),
              oninput: (e: any) => {
                this.body = e.target.value;
              },
              onkeydown: (e: any) => {
                const isSubmit = (e.key === 'Enter' || e.keyCode === 13) && (e.ctrlKey || e.metaKey);
                if (isSubmit && canSaveFallback) {
                  e.preventDefault();
                  this._submit();
                }
              },
            }),
            this.uploadError ? m('div', { className: 'Alert Alert--danger LinkRobinsSupport-uploadAlert' }, this.uploadError) : null,
            this.uploadingCount > 0
              ? m(
                  'div',
                  { className: 'LinkRobinsSupport-uploadStatus' },
                  this.uploadingCount === 1
                    ? tr('common.uploading_one', 'Uploading 1 file…')
                    : tr('common.uploading_many', 'Uploading {count} files…', { count: this.uploadingCount })
                )
              : null,
          ]),
          m('div', { className: 'LinkRobinsSupport-form-actions' }, [
            app.forum && app.forum.attribute('fof-upload.canUpload')
              ? m('span', { className: 'LinkRobinsSupport-attachBtnWrap' }, [
                  m(
                    'button',
                    {
                      type: 'button',
                      className: 'Button Button--default LinkRobinsSupport-attachBtn',
                      disabled: this.saving || this.uploadingCount > 0,
                      onclick: () => {
                        if (this._composeFileInput) this._composeFileInput.click();
                      },
                    },
                    [m('i', { className: 'fas fa-paperclip' }), ' ', tr('action.attach_files', 'Attach files')]
                  ),
                  m('input', {
                    type: 'file',
                    multiple: true,
                    style: 'display:none;',
                    disabled: this.saving || this.uploadingCount > 0,
                    oncreate: (vnode: any) => {
                      this._composeFileInput = vnode.dom;
                    },
                    onremove: () => {
                      this._composeFileInput = null;
                    },
                    onchange: (e: any) => {
                      const files = e.target.files;
                      if (files && files.length) {
                        this._uploadFiles(files);
                      }
                      try {
                        e.target.value = '';
                      } catch (err) {}
                    },
                  }),
                ])
              : null,
            m(
              'button',
              {
                type: 'button',
                className: 'Button Button--primary',
                disabled: !canSaveFallback,
                onclick: () => {
                  this._submit();
                },
              },
              this.saving ? tr('compose.submitting', 'Submitting…') : tr('compose.submit', 'Submit ticket')
            ),
          ]),
        ]),
      ])
    );
  }

  _renderComposeHeader() {
    return m('header', { className: 'LinkRobinsSupport-header' }, [
      this.categories.length > 1
        ? m(
            'button',
            {
              type: 'button',
              className: 'Button Button--link LinkRobinsSupport-backBtn',
              disabled: this.saving,
              onclick: () => {
                this._backToCategories();
              },
            },
            [m('i', { className: 'fas fa-chevron-left' }), ' ', tr('compose.back_to_categories', 'Back to categories')]
          )
        : null,
      m(
        'h1',
        { className: 'LinkRobinsSupport-title' },
        isUserSuspended() ? tr('compose.title_appeal', 'File an appeal') : tr('compose.title', 'New support ticket')
      ),
      this._renderChosenCategory(),
    ]);
  }

  // Open the docked composer to write the ticket. A single native "Submit
  // ticket" action creates the ticket (subject lives on the page).
  _openComposeComposer() {
    const cat = this._chosenCategory();
    openSupportComposer({
      supportContext: 'new-ticket',
      className: 'LinkRobinsSupport-ticketComposer',
      placeholder: tr('compose.body_placeholder', 'Describe the issue in detail. Markdown is supported.'),
      submitLabel: tr('compose.submit', 'Submit ticket'),
      confirmExit: tr('compose.discard_confirm', 'You have an unsubmitted ticket. Discard it?'),
      originalContent: this.body || '',
      supportHeaderItems: () => [
        {
          name: 'title',
          content: m('h3', { className: 'LinkRobinsSupport-composerTitle' }, [
            m('i', { className: (cat && cat.icon()) || 'fas fa-life-ring' }),
            ' ',
            this.subject || tr('compose.title', 'New support ticket'),
            cat && cat.name() ? m('span', { className: 'LinkRobinsSupport-composerTitle-cat' }, ' · ' + cat.name()) : null,
          ]),
        },
      ],
      onSupportSubmit: (content: string, body: any) => {
        this._submit(content, body);
      },
    });
  }

  // Step 1: clickable category cards (icon + name + description).
  _renderPicker() {
    const appeal = isUserSuspended();
    return m('div', { className: 'LinkRobinsSupport-container' }, [
      m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-header--picker' }, [
        m(
          'h1',
          { className: 'LinkRobinsSupport-title' },
          appeal ? tr('compose.title_appeal', 'File an appeal') : tr('compose.title', 'New support ticket')
        ),
        m(
          'p',
          { className: 'LinkRobinsSupport-pickerHint' },
          appeal
            ? tr('compose.choose_category_appeal', 'Choose an appeal category to get started.')
            : tr('compose.choose_category', 'Choose a category to get started.')
        ),
      ]),
      m(
        'ul',
        { className: 'LinkRobinsSupport-categoryCards' },
        this.categories.map((c: any) => {
          const color = c.color() || null;
          return m(
            'li',
            { className: 'LinkRobinsSupport-categoryCards-item' },
            m(
              'button',
              {
                type: 'button',
                className: 'LinkRobinsSupport-categoryCard',
                onclick: () => {
                  this._chooseCategory(String(c.id()));
                },
              },
              [
                m(
                  'span',
                  { className: 'LinkRobinsSupport-categoryCard-icon', style: color ? 'color:' + color : null },
                  m('i', { className: c.icon() || 'fas fa-life-ring' })
                ),
                m('span', { className: 'LinkRobinsSupport-categoryCard-text' }, [
                  m('span', { className: 'LinkRobinsSupport-categoryCard-name' }, c.name() || ''),
                  c.description() ? m('span', { className: 'LinkRobinsSupport-categoryCard-desc' }, c.description()) : null,
                ]),
              ]
            )
          );
        })
      ),
    ]);
  }

  // The selected-category chip shown in the form header (step 2).
  _renderChosenCategory() {
    const c = this._chosenCategory();
    if (!c) return null;
    const color = c.color() || null;
    return m('div', { className: 'LinkRobinsSupport-chosenCategory' }, [
      c.icon()
        ? m('i', {
            className: c.icon() + ' LinkRobinsSupport-chosenCategory-icon',
            style: color ? 'color:' + color : null,
          })
        : null,
      m('span', { className: 'LinkRobinsSupport-chosenCategory-name' }, c.name() || ''),
    ]);
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
    if (!err) return tr('errors.unknown', 'Unknown error.');
    try {
      const errors = err.response && err.response.errors;
      if (errors && errors[0]) {
        return errors[0].detail || errors[0].title || tr('errors.submit', 'Could not submit.');
      }
    } catch (e) {}
    return tr('errors.submit_ticket', 'Could not submit the ticket.');
  }

  // Create the ticket. Called from the docked composer with (content, body),
  // or from the fallback page button with no args (it reads this.body).
  _submit(content?: string, body?: any) {
    const bodyText = typeof content === 'string' ? content : this.body;
    const category = this._chosenCategory();

    if (this.subject.trim() === '' || this.categoryId === '' || !category) {
      showError(tr('compose.subject_first', 'Enter a subject first, then write your message.'));
      return;
    }
    if (!bodyText || bodyText.trim() === '') {
      showError(tr('errors.empty_body', 'Please write your message before submitting.'));
      return;
    }

    this.saving = true;
    this.error = null;
    if (body) body.loading = true;
    m.redraw();

    createTicket(this.subject.trim(), category, bodyText)
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
