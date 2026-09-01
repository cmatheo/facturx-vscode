const vscodeApi = acquireVsCodeApi();
window.addEventListener('error', (event) => {
  vscodeApi.postMessage({ type: 'error', message: String(event.error?.stack || event.message) });
});

let fields = [];
let profiles = [];
let values = {};
let lineItemFields = [];
let lineItemsAvailableFrom = 'basic';
let lineItems = [];
let vatBreakdownFields = [];
let vatBreakdownAvailableFrom = 'basicwl';
let vatBreakdown = [];

const profileSelect = document.getElementById('profile');
const allowMissingCheckbox = document.getElementById('allowMissing');
const groupsEl = document.getElementById('groups');
const applyBtn = document.getElementById('applyBtn');
const warningEl = document.getElementById('warning');
const lineItemsSection = document.getElementById('lineItemsSection');
const lineItemsHeaderRow = document.getElementById('lineItemsHeaderRow');
const lineItemsBody = document.getElementById('lineItemsBody');
const addLineBtn = document.getElementById('addLineBtn');
const vatSection = document.getElementById('vatSection');
const vatHeaderRow = document.getElementById('vatHeaderRow');
const vatBody = document.getElementById('vatBody');
const addVatBtn = document.getElementById('addVatBtn');

function currentProfile() {
  return profileSelect.value;
}

const PROFILE_ORDER = ['minimum', 'basicwl', 'basic', 'en16931', 'extended'];

// Date fields are kept in the UI as DD/MM/YYYY text (the native <input type="date">
// always renders per the browser/OS locale - typically MM/DD/YYYY - with no way to
// force DD/MM/YYYY) and are converted to/from the CII udt:DateTimeString storage
// format (format="102", i.e. plain YYYYMMDD) only at the init/apply boundaries.
function storageToDisplay(stored) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec((stored || '').trim());
  if (!match) {
    return stored || '';
  }
  const [, yyyy, mm, dd] = match;
  return dd + '/' + mm + '/' + yyyy;
}

function displayToStorage(display) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((display || '').trim());
  if (!match) {
    return display || '';
  }
  const [, dd, mm, yyyy] = match;
  return yyyy + mm + dd;
}

function isMandatory(field) {
  return field.mandatoryFor.includes(currentProfile());
}

function isProfileAtLeast(from) {
  return PROFILE_ORDER.indexOf(currentProfile()) >= PROFILE_ORDER.indexOf(from || 'minimum');
}

function isAvailable(field) {
  return isProfileAtLeast(field.availableFrom);
}

function lineItemsAvailable() {
  return isProfileAtLeast(lineItemsAvailableFrom);
}

function vatBreakdownAvailable() {
  return isProfileAtLeast(vatBreakdownAvailableFrom);
}

function rowHasAnyValue(fieldsList, item) {
  return fieldsList.some((f) => (item[f.id] || '').trim() !== '');
}

function render() {
  groupsEl.innerHTML = '';
  const byGroup = new Map();
  for (const field of fields) {
    if (!byGroup.has(field.group)) {
      byGroup.set(field.group, []);
    }
    byGroup.get(field.group).push(field);
  }
  for (const [groupName, groupFields] of byGroup) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = groupName;
    fieldset.appendChild(legend);
    const grid = document.createElement('div');
    grid.id = 'grid';
    for (const field of groupFields) {
      grid.appendChild(renderField(field));
    }
    fieldset.appendChild(grid);
    groupsEl.appendChild(fieldset);
  }
  renderLineItems();
  renderVatBreakdown();
  updateValidity();
}

// Shared renderer for both "zero or more rows" sections (invoice lines, VAT
// breakdown): builds a header row from fieldsList's labels and one table row per
// entry in itemsList, mutating itemsList in place (push/splice) rather than
// reassigning it, so the caller's own lineItems/vatBreakdown variable binding
// stays valid across re-renders.
function renderRepeatableTable(fieldsList, itemsList, available, headerRowEl, bodyEl, onChange) {
  headerRowEl.innerHTML = '';
  for (const field of fieldsList) {
    const th = document.createElement('th');
    th.textContent = field.label;
    th.title = field.description;
    headerRowEl.appendChild(th);
  }
  headerRowEl.appendChild(document.createElement('th'));

  bodyEl.innerHTML = '';
  itemsList.forEach((item, index) => {
    const row = document.createElement('tr');
    for (const field of fieldsList) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = field.type === 'number' ? 'text' : field.type;
      input.value = item[field.id] ?? field.default ?? '';
      input.placeholder = field.default ?? '';
      input.disabled = !available;
      input.addEventListener('input', () => {
        item[field.id] = input.value;
        updateValidity();
      });
      td.appendChild(input);
      row.appendChild(td);
    }
    const removeTd = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'rowRemoveBtn';
    removeBtn.textContent = 'x';
    removeBtn.title = 'Remove this row';
    removeBtn.addEventListener('click', () => {
      itemsList.splice(index, 1);
      onChange();
      updateValidity();
    });
    removeTd.appendChild(removeBtn);
    row.appendChild(removeTd);
    bodyEl.appendChild(row);
  });
}

function renderLineItems() {
  const available = lineItemsAvailable();
  lineItemsSection.classList.toggle('unavailable', !available);
  addLineBtn.disabled = !available;
  renderRepeatableTable(
    lineItemFields,
    lineItems,
    available,
    lineItemsHeaderRow,
    lineItemsBody,
    renderLineItems,
  );
}

function renderVatBreakdown() {
  const available = vatBreakdownAvailable();
  vatSection.classList.toggle('unavailable', !available);
  addVatBtn.disabled = !available;
  renderRepeatableTable(
    vatBreakdownFields,
    vatBreakdown,
    available,
    vatHeaderRow,
    vatBody,
    renderVatBreakdown,
  );
}

function renderField(field) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.dataset.fieldId = field.id;

  const label = document.createElement('label');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = field.label;
  name.title = field.description;
  label.appendChild(name);

  const available = isAvailable(field);
  const badge = document.createElement('span');
  badge.className = !available ? 'optional' : isMandatory(field) ? 'mandatory' : 'optional';
  badge.textContent = !available ? 'not in this profile' : isMandatory(field) ? 'required' : 'optional';
  label.appendChild(badge);
  wrap.appendChild(label);

  const isDate = field.type === 'date';
  const input = document.createElement('input');
  input.type = field.type === 'number' || isDate ? 'text' : field.type;
  input.value = isDate
    ? storageToDisplay(values[field.id] ?? field.default ?? '')
    : (values[field.id] ?? field.default ?? '');
  input.placeholder = isDate ? 'DD/MM/YYYY' : (field.default ?? '');
  input.disabled = !available;
  input.title = available ? '' : 'This field does not apply to the selected profile and will be ignored.';
  input.addEventListener('input', () => {
    values[field.id] = input.value;
    updateValidity();
  });
  wrap.appendChild(input);

  return wrap;
}

function updateValidity() {
  const allowMissing = allowMissingCheckbox.checked;
  let missing = [];
  for (const field of fields) {
    const el = groupsEl.querySelector('[data-field-id="' + field.id + '"]');
    if (!el) {
      continue;
    }
    if (!isAvailable(field)) {
      el.classList.remove('missing');
      continue;
    }
    const empty = !(values[field.id] ?? '').trim();
    const mandatory = isMandatory(field);
    el.classList.toggle('missing', mandatory && empty && !allowMissing);
    if (mandatory && empty) {
      missing.push(field.label);
    }
  }
  if (lineItemsAvailable() && !lineItems.some((line) => rowHasAnyValue(lineItemFields, line))) {
    missing.push('at least one invoice line');
  }
  if (vatBreakdownAvailable() && !vatBreakdown.some((entry) => rowHasAnyValue(vatBreakdownFields, entry))) {
    missing.push('at least one VAT breakdown row');
  }
  if (allowMissing) {
    applyBtn.disabled = false;
    warningEl.textContent = missing.length ? 'Will omit: ' + missing.join(', ') : '';
  } else {
    applyBtn.disabled = missing.length > 0;
    warningEl.textContent = missing.length ? 'Missing required: ' + missing.join(', ') : '';
  }
}

profileSelect.addEventListener('change', render);
allowMissingCheckbox.addEventListener('change', updateValidity);
addLineBtn.addEventListener('click', () => {
  lineItems.push({});
  renderLineItems();
  updateValidity();
});
addVatBtn.addEventListener('click', () => {
  vatBreakdown.push({});
  renderVatBreakdown();
  updateValidity();
});

applyBtn.addEventListener('click', () => {
  const payload = Object.assign({}, values);
  for (const field of fields) {
    if (field.type === 'date' && payload[field.id] !== undefined) {
      payload[field.id] = displayToStorage(payload[field.id]);
    }
  }
  const linesPayload = lineItems.filter((line) => rowHasAnyValue(lineItemFields, line));
  const vatPayload = vatBreakdown.filter((entry) => rowHasAnyValue(vatBreakdownFields, entry));
  vscodeApi.postMessage({
    type: 'apply',
    profile: currentProfile(),
    values: payload,
    lineItems: linesPayload,
    vatBreakdown: vatPayload,
  });
});
document.getElementById('reloadBtn').addEventListener('click', () => {
  vscodeApi.postMessage({ type: 'reload' });
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type !== 'init') {
    return;
  }
  fields = message.fields;
  profiles = message.profiles;
  values = Object.assign({}, message.values);
  lineItemFields = message.lineItemFields || [];
  lineItemsAvailableFrom = message.lineItemsAvailableFrom || 'basic';
  lineItems = (message.lineItems || []).map((line) => Object.assign({}, line));
  vatBreakdownFields = message.vatBreakdownFields || [];
  vatBreakdownAvailableFrom = message.vatBreakdownAvailableFrom || 'basicwl';
  vatBreakdown = (message.vatBreakdown || []).map((entry) => Object.assign({}, entry));
  const previousProfile = profileSelect.value;
  profileSelect.innerHTML = '';
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.value;
    opt.textContent = p.label;
    profileSelect.appendChild(opt);
  }
  profileSelect.value =
    previousProfile && profiles.some((p) => p.value === previousProfile)
      ? previousProfile
      : profiles[0].value;
  render();
});

vscodeApi.postMessage({ type: 'ready' });
