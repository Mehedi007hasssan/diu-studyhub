(function () {
  // Confirm dialogs for destructive forms (CSP blocks inline onclick handlers).
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // Mobile menu
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  if (header && toggle) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Close the account menu when clicking elsewhere or pressing Escape
  var menus = document.querySelectorAll('details.usermenu');
  document.addEventListener('click', function (e) {
    menus.forEach(function (m) { if (!m.contains(e.target)) m.removeAttribute('open'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') menus.forEach(function (m) { m.removeAttribute('open'); });
  });

  // Hero search: rotate example searches in the placeholder
  var hero = document.getElementById('hero-q');
  if (hero) {
    var samples = ['CSE131', 'data structures final', 'EEE111 lab manual', 'calculus notes', 'MAT101 midterm'];
    var i = 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      window.setInterval(function () {
        if (document.activeElement === hero || hero.value) return;
        i = (i + 1) % samples.length;
        hero.setAttribute('placeholder', 'Try "' + samples[i] + '"');
      }, 2600);
    }
  }

  // Upload form helpers
  var dept = document.getElementById('department_id');
  var course = document.getElementById('course_id');
  if (dept && course) {
    var allOptions = Array.prototype.slice.call(course.options, 1); // skip placeholder
    var placeholder = course.options[0];

    var filterCourses = function () {
      var selected = course.value;
      var d = dept.value;
      course.innerHTML = '';
      course.appendChild(placeholder);
      allOptions.forEach(function (o) {
        if (!d || o.getAttribute('data-dept') === d) course.appendChild(o);
      });
      if (selected && Array.prototype.some.call(course.options, function (o) { return o.value === selected; })) {
        course.value = selected;
      } else {
        course.value = '';
      }
    };
    dept.addEventListener('change', filterCourses);
    filterCourses();
  }

  var type = document.getElementById('type');
  var examField = document.getElementById('exam-field');
  if (type && examField) {
    var toggleExam = function () {
      examField.hidden = type.value !== 'question';
    };
    type.addEventListener('change', toggleExam);
    toggleExam();
  }

  var file = document.getElementById('file');
  var folder = document.getElementById('folder');
  var folderStatus = document.getElementById('folder-status');
  var uploadBtn = document.getElementById('upload-btn');

  if (file && folder) {
    var form = file.form;
    var max = parseInt(form.getAttribute('data-max-mb'), 10) || 25;

    file.addEventListener('change', function () {
      if (file.files[0]) {
        if (file.files[0].size > max * 1024 * 1024) {
          window.alert('That file is larger than ' + max + ' MB. Please compress it or split it.');
          file.value = '';
          return;
        }
        folder.value = '';
        if (folderStatus) {
          folderStatus.textContent = 'Select an entire directory from your device to automatically bundle as a .zip.';
          folderStatus.style.color = '';
        }
      }
    });

    folder.addEventListener('change', async function () {
      if (!folder.files || !folder.files.length) return;
      var files = folder.files;
      var totalBytes = 0;
      for (var i = 0; i < files.length; i++) {
        totalBytes += files[i].size;
      }

      if (totalBytes > max * 1024 * 1024) {
        window.alert('The total folder size exceeds ' + max + ' MB. Please remove some files or compress it.');
        folder.value = '';
        return;
      }

      if (typeof JSZip === 'undefined') {
        window.alert('Zip archiver library is still loading. Please try again in a second.');
        return;
      }

      if (folderStatus) {
        folderStatus.textContent = 'Bundling ' + files.length + ' file(s) into a zip... please wait.';
        folderStatus.style.color = 'var(--primary, #0284c7)';
      }
      if (uploadBtn) uploadBtn.disabled = true;

      try {
        var zip = new JSZip();
        for (var j = 0; j < files.length; j++) {
          var f = files[j];
          var relPath = f.webkitRelativePath || f.name;
          zip.file(relPath, f);
        }

        var folderName = 'folder_upload';
        if (files[0].webkitRelativePath) {
          folderName = files[0].webkitRelativePath.split('/')[0] || folderName;
        }

        var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        var zipFile = new File([blob], folderName + '.zip', { type: 'application/zip' });

        var dataTransfer = new DataTransfer();
        dataTransfer.items.add(zipFile);
        file.files = dataTransfer.files;

        if (folderStatus) {
          folderStatus.textContent = '✓ Folder bundled: ' + folderName + '.zip (' + (blob.size / 1024 / 1024).toFixed(2) + ' MB, ' + files.length + ' files)';
          folderStatus.style.color = 'var(--good, #16a34a)';
        }
      } catch (err) {
        console.error('Error zipping folder:', err);
        window.alert('Could not package folder into a zip. You can compress the folder to a .zip manually and upload it directly.');
        if (folderStatus) {
          folderStatus.textContent = 'Failed to bundle folder. Please upload a .zip file directly.';
          folderStatus.style.color = 'var(--danger, #dc2626)';
        }
      } finally {
        if (uploadBtn) uploadBtn.disabled = false;
      }
    });

    form.addEventListener('submit', function (e) {
      if (!file.files || !file.files[0]) {
        e.preventDefault();
        window.alert('Please choose a file or select a folder to upload.');
      }
    });
  }

  // Show / Hide password button
  document.querySelectorAll('input[type="password"]').forEach(function (input) {
    var wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    wrap.appendChild(btn);
  });

})();
