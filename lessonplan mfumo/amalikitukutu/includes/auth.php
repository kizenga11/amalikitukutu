<?php
require_once __DIR__ . '/../config/db.php';

function startAuth(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_name('lpg_session');
        session_start();
    }
}

function currentUser(): ?array {
    startAuth();
    return !empty($_SESSION['user']) ? $_SESSION['user'] : null;
}

function currentUserId(): int {
    $u = currentUser();
    return $u ? (int)$u['id'] : 0;
}

function isAdmin(): bool {
    return (currentUser()['role'] ?? '') === 'admin';
}

function requireLogin(): void {
    startAuth();
    if (empty($_SESSION['user_id'])) {
        header('Location: /amalikitukutu/login.php');
        exit;
    }
}

function requireAdmin(): void {
    requireLogin();
    if (!isAdmin()) {
        header('Location: /amalikitukutu/index.php');
        exit;
    }
}

// Subject ids the current user may access. Empty array = all subjects (admin).
function allowedSubjectIds(): array {
    $u = currentUser();
    if (!$u || $u['role'] === 'admin') return [];
    static $ids = null;
    if ($ids === null) {
        $db = getDB();
        $st = $db->prepare("SELECT subject_id FROM teacher_assignments WHERE teacher_id=?");
        $st->execute([(int)$u['id']]);
        $ids = array_map('intval', array_column($st->fetchAll(), 'subject_id'));
        $ids = array_values(array_unique($ids));
    }
    return $ids;
}

// Builds [sql, params] for scoping a query on a subject column alias (default s.id).
function subjectScopeSql(string $alias = 's'): array {
    $ids = allowedSubjectIds();
    if (empty($ids)) return ['', []];
    $in = implode(',', array_fill(0, count($ids), '?'));
    return ["$alias.id IN ($in)", $ids];
}

function scopeWhere(array $where, array $params): array {
    [$sql, $sp] = subjectScopeSql();
    if ($sql) { $where[] = $sql; $params = array_merge($params, $sp); }
    return [$where, $params];
}

// Subject list limited to the current user's subjects (all for admin).
function scopedSubjects(PDO $db): array {
    $ids = allowedSubjectIds();
    if (empty($ids)) {
        return $db->query("SELECT id, name, code FROM subjects ORDER BY name")->fetchAll();
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $st = $db->prepare("SELECT id, name, code FROM subjects WHERE id IN ($in) ORDER BY name");
    $st->execute($ids);
    return $st->fetchAll();
}

// Whether the current user may access a given subject (true for admin).
function canAccessSubject(int $subjectId): bool {
    $ids = allowedSubjectIds();
    return empty($ids) || in_array($subjectId, $ids, true);
}

// Resolves the subject_id a curriculum record belongs to (for drill-down access checks).
function subjectIdOf(PDO $db, string $table, int $id): int {
    if ($id <= 0) return 0;
    switch ($table) {
        case 'syllabuses':
            $st = $db->prepare("SELECT subject_id FROM syllabuses WHERE id=?");
            break;
        case 'modules':
            $st = $db->prepare("SELECT sy.subject_id FROM modules m JOIN syllabuses sy ON sy.id=m.syllabus_id WHERE m.id=?");
            break;
        case 'units':
            $st = $db->prepare("SELECT sy.subject_id FROM units u JOIN modules m ON m.id=u.module_id JOIN syllabuses sy ON sy.id=m.syllabus_id WHERE u.id=?");
            break;
        case 'elements':
            $st = $db->prepare("SELECT sy.subject_id FROM elements e JOIN units u ON u.id=e.unit_id JOIN modules m ON m.id=u.module_id JOIN syllabuses sy ON sy.id=m.syllabus_id WHERE e.id=?");
            break;
        default:
            return 0;
    }
    $st->execute([$id]);
    return (int)$st->fetchColumn();
}
