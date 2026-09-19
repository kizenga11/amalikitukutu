// Editable document helper — client-side edits only (never saved to the database)
function setPlanEditing(editing) {
    document.querySelectorAll('.editable-cell').forEach(function (cell) {
        cell.contentEditable = editing ? 'true' : 'false';
    });
    document.querySelectorAll('[data-edit-toggle]').forEach(function (btn) {
        btn.setAttribute('data-editing', editing ? '1' : '0');
        var label = btn.querySelector('.edit-toggle-label');
        var icon = btn.querySelector('i');
        if (label) label.textContent = editing ? 'Lock Editing' : 'Edit';
        if (icon) icon.className = editing ? 'bi bi-lock-fill' : 'bi bi-pencil-fill';
    });
    document.querySelectorAll('[data-edit-note]').forEach(function (note) {
        note.style.display = editing ? '' : 'none';
    });
}

function togglePlanEditing(btn) {
    setPlanEditing(btn.getAttribute('data-editing') !== '1');
}

// Print the on-screen document so edits appear; browsers offer "Save as PDF"
function saveDocAsPDF() {
    window.print();
}
