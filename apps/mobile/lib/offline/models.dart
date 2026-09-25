import 'dart:convert';
import 'dart:math';

import '../api/models.dart';

class SyncStatus {
  static const synced = 'SYNCED';
  static const pending = 'PENDING';
  static const syncing = 'SYNCING';
  static const failed = 'FAILED';
}

String newLocalId() {
  final stamp = DateTime.now().toUtc().microsecondsSinceEpoch;
  final extra = Random().nextInt(9999).toString().padLeft(4, '0');
  return '$stamp$extra';
}

class LocalMeasurement {
  LocalMeasurement({
    required this.localId,
    required this.capacity,
    required this.testLoad,
    required this.observedValue,
    required this.error,
    required this.permissibleError,
    required this.result,
    this.synced = false,
    this.serverId,
  });

  final String localId;
  final double capacity;
  final double testLoad;
  final double observedValue;
  final double error;
  final double permissibleError;
  final String result;
  bool synced;
  String? serverId;

  String get fingerprint => '$capacity|$testLoad|$observedValue|$permissibleError';

  Map<String, dynamic> toJson() => {
        'localId': localId,
        'capacity': capacity,
        'testLoad': testLoad,
        'observedValue': observedValue,
        'error': error,
        'permissibleError': permissibleError,
        'result': result,
        'synced': synced,
        'serverId': serverId,
      };

  factory LocalMeasurement.fromJson(Map<String, dynamic> json) {
    return LocalMeasurement(
      localId: json['localId'] as String? ?? newLocalId(),
      capacity: (json['capacity'] as num?)?.toDouble() ?? 0,
      testLoad: (json['testLoad'] as num?)?.toDouble() ?? 0,
      observedValue: (json['observedValue'] as num?)?.toDouble() ?? 0,
      error: (json['error'] as num?)?.toDouble() ?? 0,
      permissibleError: (json['permissibleError'] as num?)?.toDouble() ?? 0,
      result: json['result'] as String? ?? '',
      synced: json['synced'] == true,
      serverId: json['serverId'] as String?,
    );
  }

  InspectionMeasurement toInspection() => InspectionMeasurement(
        id: serverId ?? localId,
        testLoad: testLoad,
        observedValue: observedValue,
        error: error,
        permissibleError: permissibleError,
        result: result,
      );
}

class LocalPhoto {
  LocalPhoto({
    required this.localId,
    required this.kind,
    required this.filename,
    required this.localPath,
    this.uploaded = false,
    this.serverId,
    this.latitude,
    this.longitude,
    this.capturedAt,
  });

  final String localId;
  final String kind;
  final String filename;
  final String localPath;
  bool uploaded;
  String? serverId;
  final double? latitude;
  final double? longitude;
  final DateTime? capturedAt;

  Map<String, dynamic> toJson() => {
        'localId': localId,
        'kind': kind,
        'filename': filename,
        'localPath': localPath,
        'uploaded': uploaded,
        'serverId': serverId,
        'latitude': latitude,
        'longitude': longitude,
        'capturedAt': capturedAt?.toIso8601String(),
      };

  factory LocalPhoto.fromJson(Map<String, dynamic> json) {
    return LocalPhoto(
      localId: json['localId'] as String? ?? newLocalId(),
      kind: json['kind'] as String? ?? 'INSTRUMENT_FRONT',
      filename: json['filename'] as String? ?? 'inspection.jpg',
      localPath: json['localPath'] as String? ?? '',
      uploaded: json['uploaded'] == true,
      serverId: json['serverId'] as String?,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      capturedAt: json['capturedAt'] == null ? null : DateTime.tryParse(json['capturedAt'].toString()),
    );
  }

  InspectionPhoto toInspection() => InspectionPhoto(
        id: serverId ?? localId,
        filename: filename,
        kind: kind,
        capturedAt: capturedAt,
        localPath: localPath,
      );
}

class InspectionDraft {
  InspectionDraft({
    required this.localId,
    required this.officerId,
    required this.applicationId,
    required this.job,
    this.serverInspectionId,
    this.gpsLat,
    this.gpsLng,
    this.locationMismatch = false,
    Map<String, bool>? checklist,
    this.remarks,
    this.result,
    List<LocalMeasurement>? measurements,
    List<LocalPhoto>? photos,
    this.submittedLocally = false,
    this.submittedAt,
    this.syncStatus = SyncStatus.pending,
    this.lastSyncAttempt,
    this.syncError,
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : checklist = checklist ?? {},
        measurements = measurements ?? [],
        photos = photos ?? [],
        createdAt = createdAt ?? DateTime.now().toUtc(),
        updatedAt = updatedAt ?? DateTime.now().toUtc();

  final String localId;
  final String officerId;
  final String applicationId;
  String? serverInspectionId;
  AssignedJob job;
  double? gpsLat;
  double? gpsLng;
  bool locationMismatch;
  Map<String, bool> checklist;
  String? remarks;
  String? result;
  List<LocalMeasurement> measurements;
  List<LocalPhoto> photos;
  bool submittedLocally;
  DateTime? submittedAt;
  String syncStatus;
  DateTime? lastSyncAttempt;
  String? syncError;
  final DateTime createdAt;
  DateTime updatedAt;

  bool get queued =>
      submittedLocally &&
      (syncStatus == SyncStatus.pending ||
          syncStatus == SyncStatus.failed ||
          syncStatus == SyncStatus.syncing);

  InspectionDetail toDetail() {
    return InspectionDetail(
      id: serverInspectionId ?? 'local:$applicationId',
      result: result,
      remarks: remarks,
      locationMismatch: locationMismatch,
      startedAt: createdAt,
      submittedAt: submittedAt,
      applicationNumber: job.applicationNumber,
      applicationId: applicationId,
      applicationStatus: job.status,
      ownerName: job.ownerName,
      businessName: job.businessName,
      scheduledAt: job.scheduledAt,
      instrumentCode: job.instrumentCode,
      instrumentType: job.instrumentType,
      manufacturer: job.manufacturer,
      model: job.model,
      serialNumber: job.serialNumber,
      capacity: job.capacity,
      unit: job.unit,
      instrumentLat: job.instrumentLat,
      instrumentLng: job.instrumentLng,
      locationText: job.locationText,
      fieldLat: gpsLat,
      fieldLng: gpsLng,
      checklist: Map<String, bool>.from(checklist),
      measurements: measurements.map((row) => row.toInspection()).toList(),
      photos: photos.map((row) => row.toInspection()).toList(),
    );
  }

  Map<String, dynamic> toRow() => {
        'local_id': localId,
        'officer_id': officerId,
        'application_id': applicationId,
        'server_inspection_id': serverInspectionId,
        'job_json': jsonEncode(job.toJson()),
        'gps_lat': gpsLat,
        'gps_lng': gpsLng,
        'location_mismatch': locationMismatch ? 1 : 0,
        'checklist_json': jsonEncode(checklist),
        'remarks': remarks,
        'result': result,
        'measurements_json': jsonEncode(measurements.map((row) => row.toJson()).toList()),
        'photos_json': jsonEncode(photos.map((row) => row.toJson()).toList()),
        'submitted_locally': submittedLocally ? 1 : 0,
        'submitted_at': submittedAt?.toIso8601String(),
        'sync_status': syncStatus,
        'last_sync_attempt': lastSyncAttempt?.toIso8601String(),
        'sync_error': syncError,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };

  factory InspectionDraft.fromRow(Map<String, dynamic> row) {
    final jobRaw = jsonDecode(row['job_json'] as String? ?? '{}') as Map<String, dynamic>;
    final checklistRaw = jsonDecode(row['checklist_json'] as String? ?? '{}') as Map<String, dynamic>;
    final measurementsRaw = jsonDecode(row['measurements_json'] as String? ?? '[]') as List<dynamic>;
    final photosRaw = jsonDecode(row['photos_json'] as String? ?? '[]') as List<dynamic>;
    return InspectionDraft(
      localId: row['local_id'] as String,
      officerId: row['officer_id'] as String,
      applicationId: row['application_id'] as String,
      serverInspectionId: row['server_inspection_id'] as String?,
      job: AssignedJob.fromJson(jobRaw),
      gpsLat: (row['gps_lat'] as num?)?.toDouble(),
      gpsLng: (row['gps_lng'] as num?)?.toDouble(),
      locationMismatch: row['location_mismatch'] == 1 || row['location_mismatch'] == true,
      checklist: {
        for (final entry in checklistRaw.entries)
          if (entry.value is bool) entry.key: entry.value as bool,
      },
      remarks: row['remarks'] as String?,
      result: row['result'] as String?,
      measurements: measurementsRaw.whereType<Map<String, dynamic>>().map(LocalMeasurement.fromJson).toList(),
      photos: photosRaw.whereType<Map<String, dynamic>>().map(LocalPhoto.fromJson).toList(),
      submittedLocally: row['submitted_locally'] == 1 || row['submitted_locally'] == true,
      submittedAt: row['submitted_at'] == null ? null : DateTime.tryParse(row['submitted_at'].toString()),
      syncStatus: row['sync_status'] as String? ?? SyncStatus.pending,
      lastSyncAttempt: row['last_sync_attempt'] == null ? null : DateTime.tryParse(row['last_sync_attempt'].toString()),
      syncError: row['sync_error'] as String?,
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now().toUtc(),
      updatedAt: DateTime.tryParse(row['updated_at']?.toString() ?? '') ?? DateTime.now().toUtc(),
    );
  }
}

abstract class OfflineStore {
  Future<void> upsertAssignments({required String officerId, required List<AssignedJob> jobs});
  Future<List<AssignedJob>> assignmentsFor(String officerId);
  Future<InspectionDraft?> draftFor({required String officerId, required String applicationId});
  Future<void> saveDraft(InspectionDraft draft);
  Future<List<InspectionDraft>> draftsFor(String officerId);
  Future<List<InspectionDraft>> queuedDrafts(String officerId);
  Future<int> queuedCount(String officerId);
}

class MemoryOfflineStore implements OfflineStore {
  final _assignments = <String, Map<String, AssignedJob>>{};
  final _drafts = <String, InspectionDraft>{};

  @override
  Future<void> upsertAssignments({required String officerId, required List<AssignedJob> jobs}) async {
    _assignments[officerId] = {for (final job in jobs) job.applicationId: job};
  }

  @override
  Future<List<AssignedJob>> assignmentsFor(String officerId) async {
    return (_assignments[officerId] ?? {}).values.toList();
  }

  @override
  Future<InspectionDraft?> draftFor({required String officerId, required String applicationId}) async {
    for (final draft in _drafts.values) {
      if (draft.officerId == officerId && draft.applicationId == applicationId) return draft;
    }
    return null;
  }

  @override
  Future<void> saveDraft(InspectionDraft draft) async {
    draft.updatedAt = DateTime.now().toUtc();
    _drafts[draft.localId] = draft;
  }

  @override
  Future<List<InspectionDraft>> draftsFor(String officerId) async {
    return _drafts.values.where((draft) => draft.officerId == officerId).toList();
  }

  @override
  Future<List<InspectionDraft>> queuedDrafts(String officerId) async {
    return (await draftsFor(officerId)).where((draft) => draft.queued).toList();
  }

  @override
  Future<int> queuedCount(String officerId) async {
    return (await draftsFor(officerId)).where((draft) => draft.queued).length;
  }
}
