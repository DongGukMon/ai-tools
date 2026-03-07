(function () {
  'use strict';

  var schema = window.__SCHEMA__;
  var token = window.__TOKEN__;
  var timeout = window.__TIMEOUT__;
  var app = document.getElementById('app');

  // ── Helpers ──

  function setNested(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = obj;
    keys.forEach(function (k) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      target = target[k];
    });
    target[last] = value;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Map compact type codes to HTML input types
  var inputTypeMap = {
    t: 'text', pw: 'password', url: 'url', email: 'email',
    tel: 'tel', date: 'date', time: 'time', dt: 'datetime-local', n: 'number'
  };

  // ── Field Builders ──
  // Each builder: function(name, label, opts) → HTMLElement

  function buildInput(name, type, opts) {
    var input = el('input', 'field-input');
    input.type = type;
    input.name = name;
    input.id = 'field-' + name;
    if (opts.ph) input.placeholder = opts.ph;
    if (opts.r) input.required = true;
    if (opts.def !== undefined) input.value = opts.def;
    if (opts.pat) input.pattern = opts.pat;
    if (type === 'number') {
      if (opts.min !== undefined) input.min = opts.min;
      if (opts.max !== undefined) input.max = opts.max;
      if (opts.step) input.step = opts.step;
    } else {
      if (opts.min !== undefined) input.minLength = opts.min;
      if (opts.max !== undefined) input.maxLength = opts.max;
    }
    return input;
  }

  function buildTextarea(name, label, opts) {
    var ta = el('textarea', 'field-input field-textarea');
    ta.name = name;
    ta.id = 'field-' + name;
    ta.rows = opts.rows || 4;
    if (opts.ph) ta.placeholder = opts.ph;
    if (opts.r) ta.required = true;
    if (opts.def) ta.value = opts.def;
    return ta;
  }

  function buildSelect(name, label, opts) {
    var select = el('select', 'field-input field-select');
    select.name = name;
    select.id = 'field-' + name;
    if (opts.r) select.required = true;

    var ph = el('option', '', opts.ph || 'Select...');
    ph.value = '';
    ph.disabled = true;
    ph.selected = !opts.def;
    select.appendChild(ph);

    (opts.o || []).forEach(function (o) {
      var option = el('option', '', o);
      option.value = o;
      if (opts.def === o) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function buildMultiSelect(name, label, opts) {
    var wrapper = el('div', 'space-y-2');
    (opts.o || []).forEach(function (o) {
      var lbl = el('label', 'flex items-center gap-2.5 cursor-pointer py-0.5');
      var cb = el('input', 'field-checkbox');
      cb.type = 'checkbox';
      cb.name = name;
      cb.value = o;
      if (Array.isArray(opts.def) && opts.def.indexOf(o) !== -1) cb.checked = true;
      lbl.appendChild(cb);
      lbl.appendChild(el('span', 'text-sm text-gray-700', o));
      wrapper.appendChild(lbl);
    });
    return wrapper;
  }

  function buildRadio(name, label, opts) {
    var wrapper = el('div', 'space-y-2');
    (opts.o || []).forEach(function (o) {
      var lbl = el('label', 'flex items-center gap-2.5 cursor-pointer py-0.5');
      var radio = el('input', 'field-radio');
      radio.type = 'radio';
      radio.name = name;
      radio.value = o;
      if (opts.def === o) radio.checked = true;
      if (opts.r) radio.required = true;
      lbl.appendChild(radio);
      lbl.appendChild(el('span', 'text-sm text-gray-700', o));
      wrapper.appendChild(lbl);
    });
    return wrapper;
  }

  function buildCheckbox(name, label, opts) {
    var lbl = el('label', 'flex items-center gap-2.5 cursor-pointer');
    var cb = el('input', 'field-checkbox');
    cb.type = 'checkbox';
    cb.name = name;
    cb.id = 'field-' + name;
    if (opts.def) cb.checked = true;
    lbl.appendChild(cb);
    lbl.appendChild(el('span', 'text-sm font-medium text-gray-700', label));
    return lbl;
  }

  function buildColor(name, label, opts) {
    var input = el('input', 'field-color');
    input.type = 'color';
    input.name = name;
    input.id = 'field-' + name;
    if (opts.def) input.value = opts.def;
    return input;
  }

  function buildRange(name, label, opts) {
    var wrapper = el('div', 'flex items-center gap-4');
    var input = el('input', 'field-range');
    input.type = 'range';
    input.name = name;
    input.id = 'field-' + name;
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step) input.step = opts.step;
    if (opts.def !== undefined) input.value = opts.def;

    var display = el('span', 'text-sm text-gray-500 w-14 text-right font-mono timer', input.value);
    input.oninput = function () { display.textContent = input.value; };

    wrapper.appendChild(input);
    wrapper.appendChild(display);
    return wrapper;
  }

  function buildFile(name, label, opts) {
    var input = el('input', 'field-file');
    input.type = 'file';
    input.name = name;
    input.id = 'field-' + name;
    if (opts.accept) input.accept = opts.accept;
    if (opts.mul) input.multiple = true;
    if (opts.r) input.required = true;
    return input;
  }

  function buildJson(name, label, opts) {
    var ta = el('textarea', 'field-input field-textarea field-json');
    ta.name = name;
    ta.id = 'field-' + name;
    ta.rows = opts.rows || 6;
    ta.placeholder = opts.ph || '{}';
    if (opts.r) ta.required = true;
    if (opts.def !== undefined) {
      ta.value = typeof opts.def === 'string' ? opts.def : JSON.stringify(opts.def, null, 2);
    }
    // Validate JSON on blur
    ta.addEventListener('blur', function () {
      if (!ta.value.trim()) return;
      try {
        JSON.parse(ta.value);
        ta.style.borderColor = '';
      } catch (e) {
        ta.style.borderColor = '#ef4444';
      }
    });
    return ta;
  }

  function buildList(name, label, opts) {
    var wrapper = el('div', 'space-y-2');
    var items = el('div', 'space-y-2');
    items.dataset.listName = name;
    wrapper.appendChild(items);

    var itemType = opts.it || 't';
    var itemOpts = opts.io || {};

    function addItem(value) {
      var row = el('div', 'flex gap-2 items-center');
      var input = el('input', 'field-input flex-1');
      input.type = inputTypeMap[itemType] || 'text';
      input.name = name + '[]';
      if (itemOpts.ph) input.placeholder = itemOpts.ph;
      if (value !== undefined) input.value = value;

      var removeBtn = el('button', 'list-remove-btn', '\u00d7');
      removeBtn.type = 'button';
      removeBtn.onclick = function () {
        row.remove();
        // Ensure at least one row if min
        if (opts.min && items.children.length < opts.min) addItem();
      };

      row.appendChild(input);
      row.appendChild(removeBtn);
      items.appendChild(row);
    }

    // Default items
    if (Array.isArray(opts.def) && opts.def.length > 0) {
      opts.def.forEach(function (v) { addItem(v); });
    } else {
      addItem();
    }

    var addBtn = el('button', 'list-add-btn', '+ Add item');
    addBtn.type = 'button';
    addBtn.onclick = function () {
      if (opts.max && items.children.length >= opts.max) return;
      addItem();
    };
    wrapper.appendChild(addBtn);

    return wrapper;
  }

  function buildGroup(name, label, opts) {
    var fieldset = el('fieldset', 'group-fieldset space-y-5');
    (opts.f || []).forEach(function (subRaw) {
      var fieldEl = buildField(subRaw, name + '.');
      if (fieldEl) fieldset.appendChild(fieldEl);
    });
    return fieldset;
  }

  // Builder registry
  var builders = {
    t: function (n, l, o) { return buildInput(n, 'text', o); },
    pw: function (n, l, o) { return buildInput(n, 'password', o); },
    url: function (n, l, o) { return buildInput(n, 'url', o); },
    email: function (n, l, o) { return buildInput(n, 'email', o); },
    tel: function (n, l, o) { return buildInput(n, 'tel', o); },
    date: function (n, l, o) { return buildInput(n, 'date', o); },
    time: function (n, l, o) { return buildInput(n, 'time', o); },
    dt: function (n, l, o) { return buildInput(n, 'datetime-local', o); },
    n: function (n, l, o) { return buildInput(n, 'number', o); },
    ta: buildTextarea,
    sel: buildSelect,
    msel: buildMultiSelect,
    rad: buildRadio,
    cb: buildCheckbox,
    color: buildColor,
    range: buildRange,
    file: buildFile,
    json: buildJson,
    list: buildList,
    grp: buildGroup
  };

  // ── Build a single field with label ──

  function buildField(raw, prefix) {
    var name = raw[0];
    var type = raw[1];
    var label = raw[2];
    var opts = raw[3] || {};
    var fullName = (prefix || '') + name;

    var builder = builders[type];
    if (!builder) return null;

    var wrapper = el('div', 'space-y-1.5');

    // Label (checkbox has inline label)
    if (type !== 'cb') {
      var labelEl = el('label', 'block text-sm font-medium text-gray-700');
      labelEl.textContent = label;
      labelEl.setAttribute('for', 'field-' + fullName);
      if (opts.r) {
        var req = el('span', 'text-red-400 ml-0.5', ' *');
        labelEl.appendChild(req);
      }
      wrapper.appendChild(labelEl);
    }

    var input = builder(fullName, label, opts);
    wrapper.appendChild(input);

    return wrapper;
  }

  // ── Data Collection ──

  function collectData(fields, prefix) {
    var data = {};
    fields.forEach(function (raw) {
      var name = raw[0];
      var type = raw[1];
      var opts = raw[3] || {};
      var fullName = (prefix || '') + name;

      switch (type) {
        case 'cb':
          var cbEl = document.getElementById('field-' + fullName);
          data[name] = cbEl ? cbEl.checked : false;
          break;

        case 'msel':
          var checked = form.querySelectorAll('input[name="' + fullName + '"]:checked');
          data[name] = Array.from(checked).map(function (c) { return c.value; });
          break;

        case 'rad':
          var selected = form.querySelector('input[name="' + fullName + '"]:checked');
          data[name] = selected ? selected.value : null;
          break;

        case 'list':
          var listInputs = form.querySelectorAll('input[name="' + fullName + '[]"]');
          data[name] = Array.from(listInputs).map(function (i) { return i.value; }).filter(function (v) { return v; });
          break;

        case 'json':
          var jsonVal = document.getElementById('field-' + fullName);
          if (jsonVal && jsonVal.value.trim()) {
            try { data[name] = JSON.parse(jsonVal.value); }
            catch (e) { data[name] = jsonVal.value; }
          } else {
            data[name] = null;
          }
          break;

        case 'n':
        case 'range':
          var numEl = document.getElementById('field-' + fullName);
          data[name] = numEl && numEl.value !== '' ? Number(numEl.value) : null;
          break;

        case 'file':
          // Files collected separately in async flow
          break;

        case 'grp':
          data[name] = collectData(opts.f || [], fullName + '.');
          break;

        default:
          var inputEl = document.getElementById('field-' + fullName);
          data[name] = inputEl ? inputEl.value : null;
          break;
      }
    });
    return data;
  }

  // Collect file fields as base64
  function collectFiles(fields, prefix) {
    var promises = [];
    fields.forEach(function (raw) {
      var name = raw[0];
      var type = raw[1];
      var opts = raw[3] || {};
      var fullName = (prefix || '') + name;

      if (type === 'file') {
        var input = document.getElementById('field-' + fullName);
        if (input && input.files.length > 0) {
          var filePromises = Array.from(input.files).map(function (file) {
            return new Promise(function (resolve) {
              var reader = new FileReader();
              reader.onload = function () {
                resolve({ name: file.name, type: file.type, size: file.size, data: reader.result });
              };
              reader.readAsDataURL(file);
            });
          });
          promises.push(Promise.all(filePromises).then(function (results) {
            return { field: fullName, files: results };
          }));
        }
      } else if (type === 'grp') {
        promises.push.apply(promises, collectFiles(opts.f || [], fullName + '.'));
      }
    });
    return promises;
  }

  // ── Render ──

  var container = el('div', 'py-8 px-4 sm:py-12');
  var card = el('div', 'max-w-2xl mx-auto bg-white rounded-2xl shadow-lg shadow-gray-200/60 overflow-hidden');
  var header = el('div', 'px-8 pt-8 pb-2');
  var body = el('div', 'px-8 pb-8');

  // Title
  if (schema.t) {
    header.appendChild(el('h1', 'text-xl font-bold text-gray-900', schema.t));
  }

  // Description
  if (schema.d) {
    header.appendChild(el('p', 'text-sm text-gray-500 mt-1', schema.d));
  }

  // Timer
  var timerEl = el('div', 'text-xs text-gray-400 mt-3 timer');
  header.appendChild(timerEl);

  card.appendChild(header);

  // Divider
  card.appendChild(el('hr', 'border-gray-100 mx-8 my-0'));

  // Form
  var form = document.createElement('form');
  form.className = 'space-y-5 pt-6';

  schema.f.forEach(function (raw) {
    var fieldEl = buildField(raw, '');
    if (fieldEl) form.appendChild(fieldEl);
  });

  // Buttons
  var btnGroup = el('div', 'flex gap-3 pt-6');
  var cancelBtn = el('button', 'btn-secondary flex-1', 'Cancel');
  cancelBtn.type = 'button';
  var submitBtn = el('button', 'btn-primary flex-1', 'Submit');
  submitBtn.type = 'submit';

  btnGroup.appendChild(cancelBtn);
  btnGroup.appendChild(submitBtn);
  form.appendChild(btnGroup);

  body.appendChild(form);
  card.appendChild(body);
  container.appendChild(card);
  app.appendChild(container);

  // ── Timer ──

  var remaining = timeout;
  function updateTimer() {
    var min = Math.floor(remaining / 60);
    var sec = remaining % 60;
    timerEl.textContent = min + ':' + (sec < 10 ? '0' : '') + sec + ' remaining';
    if (remaining <= 30) {
      timerEl.className = 'text-xs mt-3 timer timer-warning';
    }
  }
  updateTimer();

  var timerInterval = setInterval(function () {
    remaining--;
    updateTimer();
    if (remaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);

  // ── SSE Heartbeat ──

  var sse = new EventSource('/heartbeat?token=' + token);
  sse.addEventListener('timeout', function () {
    clearInterval(timerInterval);
    showResult('Time expired', 'timeout');
  });
  sse.onerror = function () {
    clearInterval(timerInterval);
    showResult('Connection lost', 'error');
  };

  // ── Submit ──

  form.onsubmit = function (e) {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    var data = collectData(schema.f, '');

    // Handle files
    var filePromises = collectFiles(schema.f, '');
    Promise.all(filePromises).then(function (fileResults) {
      fileResults.forEach(function (fr) {
        var value = fr.files.length === 1 ? fr.files[0] : fr.files;
        setNested(data, fr.field, value);
      });

      return fetch('/submit?token=' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }).then(function (res) {
      if (res.ok) {
        showResult('Submitted successfully', 'success');
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    });
  };

  // ── Cancel ──

  cancelBtn.onclick = function () {
    fetch('/cancel?token=' + token, { method: 'POST' }).then(function () {
      showResult('Cancelled', 'cancelled');
    });
  };

  // ── Result overlay ──

  function showResult(message, type) {
    sse.close();
    clearInterval(timerInterval);

    var overlay = el('div', 'result-overlay');
    var resultCard = el('div', 'result-card');

    var icon = el('div', 'text-4xl mb-3');
    if (type === 'success') icon.textContent = '\u2705';
    else if (type === 'cancelled') icon.textContent = '\u274c';
    else if (type === 'timeout') icon.textContent = '\u23f0';
    else icon.textContent = '\u26a0\ufe0f';

    resultCard.appendChild(icon);
    resultCard.appendChild(el('p', 'text-lg font-semibold text-gray-900', message));

    var closeMsg = el('p', 'text-sm text-gray-400 mt-3 timer');
    resultCard.appendChild(closeMsg);

    overlay.appendChild(resultCard);
    document.body.appendChild(overlay);

    var closeCountdown = 3;
    function updateClose() {
      closeMsg.textContent = 'Closing in ' + closeCountdown + 's...';
      if (closeCountdown <= 0) {
        window.close();
        // If browser blocks window.close(), show fallback
        closeMsg.textContent = 'You can close this tab.';
        return;
      }
      closeCountdown--;
      setTimeout(updateClose, 1000);
    }
    updateClose();
  }

})();
