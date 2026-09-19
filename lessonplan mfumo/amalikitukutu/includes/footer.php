        </div><!-- /page-content -->
    </div><!-- /main-content -->
</div><!-- /app-wrapper -->

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script src="/amalikitukutu/assets/js/main.js"></script>
<script src="/amalikitukutu/assets/js/editable.js"></script>
<script>
// Global confirm dialog for delete actions
document.addEventListener('submit', function(e) {
    var form = e.target;
    var delBtn = form.querySelector('[data-confirm]');
    if (delBtn) {
        e.preventDefault();
        var msg = delBtn.getAttribute('data-confirm') || 'Delete this item permanently?';
        if (confirm(msg)) {
            form.submit();
        }
    }
});
</script>
</body>
</html>
