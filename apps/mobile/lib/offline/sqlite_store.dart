import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../api/models.dart';
import 'models.dart';

class SqliteOfflineStore implements OfflineStore {
  SqliteOfflineStore(this._db);

  final Database _db;

  static Future<SqliteOfflineStore> open({String? path}) async {
    final dbPath = path ?? p.join(await getDatabasesPath(), 'lm_smart_offline.db');
    final db = await openDatabase(
      dbPath,
      version: 1,
      onCreate: (database, version) async {
        await database.execute('''
CREATE TABLE cached_assignments (
  officer_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  job_json TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  PRIMARY KEY (officer_id, application_id)
)
''');
        await database.execute('''
CREATE TABLE inspection_drafts (
  local_id TEXT PRIMARY KEY,
  officer_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  server_inspection_id TEXT,
  job_json TEXT NOT NULL,
  gps_lat REAL,
  gps_lng REAL,
  location_mismatch INTEGER NOT NULL DEFAULT 0,
  checklist_json TEXT,
  remarks TEXT,
  result TEXT,
  measurements_json TEXT,
  photos_json TEXT,
  submitted_locally INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  sync_status TEXT NOT NULL,
  last_sync_attempt TEXT,
  sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (officer_id, application_id)
)
''');
      },
    );
    return SqliteOfflineStore(db);
  }

  @override
  Future<void> upsertAssignments({required String officerId, required List<AssignedJob> jobs}) async {
    final now = DateTime.now().toUtc().toIso8601String();
    await _db.transaction((txn) async {
      final keep = jobs.map((job) => job.applicationId).toSet();
      final existing = await txn.query(
        'cached_assignments',
        columns: ['application_id'],
        where: 'officer_id = ?',
        whereArgs: [officerId],
      );
      for (final row in existing) {
        final id = row['application_id'] as String;
        if (!keep.contains(id)) {
          await txn.delete(
            'cached_assignments',
            where: 'officer_id = ? AND application_id = ?',
            whereArgs: [officerId, id],
          );
        }
      }
      for (final job in jobs) {
        await txn.insert(
          'cached_assignments',
          {
            'officer_id': officerId,
            'application_id': job.applicationId,
            'job_json': jsonEncode(job.toJson()),
            'cached_at': now,
          },
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
    });
  }

  @override
  Future<List<AssignedJob>> assignmentsFor(String officerId) async {
    final rows = await _db.query(
      'cached_assignments',
      where: 'officer_id = ?',
      whereArgs: [officerId],
      orderBy: 'cached_at DESC',
    );
    return [
      for (final row in rows)
        AssignedJob.fromJson(jsonDecode(row['job_json'] as String) as Map<String, dynamic>),
    ];
  }

  @override
  Future<InspectionDraft?> draftFor({required String officerId, required String applicationId}) async {
    final rows = await _db.query(
      'inspection_drafts',
      where: 'officer_id = ? AND application_id = ?',
      whereArgs: [officerId, applicationId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return InspectionDraft.fromRow(rows.first);
  }

  @override
  Future<void> saveDraft(InspectionDraft draft) async {
    draft.updatedAt = DateTime.now().toUtc();
    await _db.insert(
      'inspection_drafts',
      draft.toRow(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  @override
  Future<List<InspectionDraft>> draftsFor(String officerId) async {
    final rows = await _db.query(
      'inspection_drafts',
      where: 'officer_id = ?',
      whereArgs: [officerId],
      orderBy: 'updated_at DESC',
    );
    return rows.map(InspectionDraft.fromRow).toList();
  }

  @override
  Future<List<InspectionDraft>> queuedDrafts(String officerId) async {
    final rows = await _db.query(
      'inspection_drafts',
      where: 'officer_id = ? AND submitted_locally = 1 AND sync_status IN (?, ?, ?)',
      whereArgs: [officerId, SyncStatus.pending, SyncStatus.failed, SyncStatus.syncing],
    );
    return rows.map(InspectionDraft.fromRow).toList();
  }

  @override
  Future<int> queuedCount(String officerId) async {
    final result = await _db.rawQuery(
      'SELECT COUNT(*) AS c FROM inspection_drafts WHERE officer_id = ? AND submitted_locally = 1 AND sync_status IN (?, ?)',
      [officerId, SyncStatus.pending, SyncStatus.failed],
    );
    return (result.first['c'] as num?)?.toInt() ?? 0;
  }
}
