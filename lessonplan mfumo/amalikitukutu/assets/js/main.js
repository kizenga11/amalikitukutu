// Sidebar toggle for mobile (with backdrop, ESC, and resize handling)
(function () {
    var toggle = document.getElementById('sidebarToggle');
    var sidebar = document.querySelector('.sidebar');
    var backdrop = document.getElementById('sidebarBackdrop');

    if (!sidebar) return;

    function isMobile() {
        return window.matchMedia('(max-width: 767px)').matches;
    }

    function setOpen(open) {
        sidebar.classList.toggle('open', open);
        document.body.style.overflow = open && isMobile() ? 'hidden' : '';
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    if (toggle) {
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            setOpen(!sidebar.classList.contains('open'));
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', function () { setOpen(false); });
    }

    sidebar.addEventListener('click', function (e) {
        if (isMobile() && e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) setOpen(false);
    });

    window.addEventListener('resize', function () {
        if (!isMobile()) setOpen(false);
    });
})();

// Dynamic dependent dropdowns for lesson plan generation
document.addEventListener('DOMContentLoaded', function () {

    const subjectEl  = document.getElementById('subject_id');
    const syllabusEl = document.getElementById('syllabus_id');
    const moduleEl   = document.getElementById('module_id');
    const unitEl     = document.getElementById('unit_id');
    const elementEl  = document.getElementById('element_id');

    function resetSelect(el, placeholder) {
        if (!el) return;
        el.innerHTML = `<option value="">${placeholder}</option>`;
        el.disabled = true;
    }

    function loadOptions(el, url, placeholder) {
        if (!el) return;
        el.innerHTML = `<option value="">Loading...</option>`;
        el.disabled = true;
        fetch(url)
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(data) {
                el.innerHTML = `<option value="">${placeholder}</option>`;
                if (data.length === 0) {
                    el.innerHTML = `<option value="">— No items found —</option>`;
                } else {
                    data.forEach(function(row) {
                        var opt = document.createElement('option');
                        opt.value = row.id;
                        opt.textContent = row.label;
                        el.appendChild(opt);
                    });
                }
                el.disabled = false;
            })
            .catch(function(err) {
                console.error('Dropdown load failed:', url, err);
                el.innerHTML = `<option value="">— Error loading (check console) —</option>`;
                el.disabled = false;
            });
    }

    if (subjectEl) {
        subjectEl.addEventListener('change', function () {
            resetSelect(syllabusEl, '— Select syllabus —');
            resetSelect(moduleEl,   '— Select module —');
            resetSelect(unitEl,     '— Select unit —');
            resetSelect(elementEl,  '— Select element —');
            if (this.value) {
                loadOptions(syllabusEl, '/amalikitukutu/ajax.php?action=syllabuses&subject_id=' + this.value, '— Select Syllabus —');
            }
        });
    }

    if (syllabusEl) {
        syllabusEl.addEventListener('change', function () {
            resetSelect(moduleEl,  '— Select module —');
            resetSelect(unitEl,    '— Select unit —');
            resetSelect(elementEl, '— Select element —');
            if (this.value) {
                loadOptions(moduleEl, '/amalikitukutu/ajax.php?action=modules&syllabus_id=' + this.value, '— Select Module (Main Competence) —');
            }
        });
    }

    if (moduleEl) {
        moduleEl.addEventListener('change', function () {
            resetSelect(unitEl,    '— Select unit —');
            resetSelect(elementEl, '— Select element —');
            if (this.value) {
                loadOptions(unitEl, '/amalikitukutu/ajax.php?action=units&module_id=' + this.value, '— Select Unit (Specific Competence) —');
            }
        });
    }

    if (unitEl) {
        unitEl.addEventListener('change', function () {
            resetSelect(elementEl, '— Select element —');
            if (this.value) {
                loadOptions(elementEl, '/amalikitukutu/ajax.php?action=elements&unit_id=' + this.value, '— Select Element (Learning Activity) —');
            }
        });
    }
});
