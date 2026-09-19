<?php
require_once __DIR__ . '/auth.php';
requireLogin();
$currentUser = currentUser();
$isAdmin = isAdmin();
$currentPage = basename($_SERVER['PHP_SELF']);
function navItem(string $href, string $icon, string $label, string $current): string {
    $file = basename($href);
    $active = ($file === $current) ? ' active' : '';
    return "<a href=\"$href\" class=\"sidebar-nav-item$active\"><i class=\"bi bi-$icon\"></i>$label</a>";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($pageTitle ?? 'Lesson Plan Generator') ?> — EduProx systems</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
    <link href="/amalikitukutu/assets/css/style.css" rel="stylesheet">
</head>
<body>
<div class="app-wrapper">

    <!-- ===== SIDEBAR ===== -->
    <aside class="sidebar">
        <a class="sidebar-brand" href="/amalikitukutu/">
            <div class="sidebar-brand-icon"><i class="bi bi-journal-richtext"></i></div>
            <div class="sidebar-brand-text">
                <span class="sidebar-brand-name">Lesson Planner</span>
                <span class="sidebar-brand-sub">EduProx systems</span>
            </div>
        </a>

        <div class="sidebar-section">
            <?= navItem('/amalikitukutu/index.php', 'grid-1x2-fill', 'Dashboard', $currentPage) ?>
        </div>

        <?php if ($isAdmin): ?>
        <div class="sidebar-section">
            <span class="sidebar-section-label">Curriculum</span>
            <?= navItem('/amalikitukutu/subjects.php',   'book',       'Subjects', $currentPage) ?>
            <?= navItem('/amalikitukutu/syllabuses.php', 'journals',   'Syllabuses', $currentPage) ?>
            <?= navItem('/amalikitukutu/modules.php',    'folder2',    'Modules', $currentPage) ?>
            <?= navItem('/amalikitukutu/units.php',      'collection', 'Units', $currentPage) ?>
            <?= navItem('/amalikitukutu/elements.php',   'list-task',  'Elements', $currentPage) ?>
        </div>
        <?php endif; ?>

        <div class="sidebar-section">
            <span class="sidebar-section-label">Plans</span>
            <?= navItem('/amalikitukutu/lesson_plans.php', 'file-earmark-text',      'Lesson Plans',    $currentPage) ?>
            <?= navItem('/amalikitukutu/scheme_of_works.php', 'calendar-week',      'Schemes of Work', $currentPage) ?>
            <?= navItem('/amalikitukutu/exports.php',      'file-earmark-arrow-down','Download Center', $currentPage) ?>
            <?php if ($isAdmin): ?>
            <?= navItem('/amalikitukutu/seed_data.php',    'terminal',               'Import SQL',      $currentPage) ?>
            <?php endif; ?>
        </div>

        <a href="/amalikitukutu/generate.php" class="sidebar-cta">
            <span class="sidebar-cta-label">Quick Action</span>
            <span class="sidebar-cta-title"><i class="bi bi-magic"></i> Lesson Plan</span>
        </a>
        <a href="/amalikitukutu/generate_sow.php" class="sidebar-cta" style="background:linear-gradient(135deg,#0d9488,#0891b2);margin-top:8px">
            <span class="sidebar-cta-label">Quick Action</span>
            <span class="sidebar-cta-title"><i class="bi bi-calendar-week"></i> Scheme of Work</span>
        </a>

        <div class="sidebar-footer">
            <div class="sidebar-footer-text">EduProx systems</div>
        </div>
    </aside>

    <!-- Mobile sidebar backdrop -->
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>

    <!-- ===== MAIN CONTENT ===== -->
    <div class="main-content">

        <!-- Topbar -->
        <header class="topbar">
            <button class="sidebar-toggle no-print" id="sidebarToggle" aria-label="Toggle sidebar">
                <i class="bi bi-list"></i>
            </button>
            <div style="flex:1">
                <div class="topbar-title"><?= htmlspecialchars($pageTitle ?? 'Dashboard') ?></div>
            </div>
            <div class="topbar-actions">
                <div class="topbar-user">
                    <div class="topbar-user-avatar"><?= strtoupper(substr(htmlspecialchars($currentUser['name'] ?? 'U'), 0, 1)) ?></div>
                    <div class="topbar-user-info">
                        <div class="topbar-user-name"><?= htmlspecialchars($currentUser['name'] ?? 'User') ?></div>
                        <div class="topbar-user-role"><?= $isAdmin ? 'Administrator' : 'Teacher' ?></div>
                    </div>
                    <a href="/amalikitukutu/logout.php" class="btn btn-outline btn-sm" title="Sign out">
                        <i class="bi bi-box-arrow-right"></i>
                    </a>
                </div>
                <a href="/amalikitukutu/generate.php" class="btn btn-primary btn-sm">
                    <i class="bi bi-magic"></i> <span class="btn-text">New Plan</span>
                </a>
                <?php if ($isAdmin): ?>
                <a href="/amalikitukutu/seed_data.php" class="btn btn-outline btn-sm">
                    <i class="bi bi-terminal"></i> <span class="btn-text">Import SQL</span>
                </a>
                <?php endif; ?>
            </div>
        </header>

        <!-- Page Content -->
        <div class="page-content">
