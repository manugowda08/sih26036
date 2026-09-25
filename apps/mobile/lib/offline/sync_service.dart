import '../api/api_client.dart';
import 'models.dart';
import 'photo_store.dart';

class SyncReport {
  SyncReport({this.synced = 0, this.failed = 0, this.errors = const []});

  int synced;
  int failed;
  List<String> errors;

  bool get ok => failed == 0;
}

class SyncService {
  SyncService({required this.api, required this.store, required this.photos});

  final ApiClient api;
  final OfflineStore store;
  final PhotoStore photos;

  Future<SyncReport> syncOfficer(String officerId) async {
    final report = SyncReport(errors: []);
    final drafts = await store.queuedDrafts(officerId);
    for (final draft in drafts) {
      try {
        await syncDraft(draft);
        report.synced += 1;
      } catch (err) {
        draft.syncStatus = SyncStatus.failed;
        draft.syncError = _human(err);
        draft.lastSyncAttempt = DateTime.now().toUtc();
        await store.saveDraft(draft);
        report.failed += 1;
        report.errors.add('${draft.job.applicationNumber}: ${draft.syncError}');
      }
    }
    return report;
  }

  Future<void> syncDraft(InspectionDraft draft) async {
    draft.syncStatus = SyncStatus.syncing;
    draft.syncError = null;
    draft.lastSyncAttempt = DateTime.now().toUtc();
    await store.saveDraft(draft);

    var inspectionId = draft.serverInspectionId;
    if (inspectionId == null || inspectionId.startsWith('local:')) {
      final started = await api.startInspection(draft.applicationId);
      inspectionId = started.id;
      draft.serverInspectionId = inspectionId;
      await store.saveDraft(draft);
    }

    await api.updateInspection(
      inspectionId,
      remarks: draft.remarks,
      locationMismatch: draft.locationMismatch,
      latitude: draft.gpsLat,
      longitude: draft.gpsLng,
      checklist: Map<String, bool>.from(draft.checklist),
    );

    final seenFingerprints = <String>{};
    for (final row in draft.measurements) {
      if (row.synced) {
        seenFingerprints.add(row.fingerprint);
        continue;
      }
      if (seenFingerprints.contains(row.fingerprint)) {
        row.synced = true;
        continue;
      }
      final updated = await api.addMeasurement(
        inspectionId,
        capacity: row.capacity,
        testLoad: row.testLoad,
        observedValue: row.observedValue,
        permissibleError: row.permissibleError,
      );
      row.synced = true;
      row.serverId = updated.measurements.isEmpty ? null : updated.measurements.last.id;
      seenFingerprints.add(row.fingerprint);
      await store.saveDraft(draft);
    }

    for (final photo in draft.photos) {
      if (photo.uploaded) continue;
      final bytes = await photos.read(photo.localPath);
      if (bytes.isEmpty) {
        throw ApiException('Offline evidence file is missing for ${photo.filename}');
      }
      await api.uploadPhoto(
        inspectionId,
        bytes: bytes,
        filename: photo.filename,
        kind: photo.kind,
        latitude: photo.latitude,
        longitude: photo.longitude,
      );
      photo.uploaded = true;
      await store.saveDraft(draft);
    }

    if (draft.submittedLocally) {
      try {
        await api.completeInspection(
          inspectionId,
          result: draft.result ?? 'PASS',
          remarks: draft.remarks,
        );
      } on ApiException catch (err) {
        final message = err.message.toLowerCase();
        if (!message.contains('already submitted')) {
          rethrow;
        }
      }
    }

    for (final photo in draft.photos) {
      if (photo.localPath.isNotEmpty) {
        await photos.delete(photo.localPath);
      }
    }

    draft.syncStatus = SyncStatus.synced;
    draft.syncError = null;
    await store.saveDraft(draft);
  }

  String _human(Object err) {
    if (err is ApiException) return err.message;
    return 'Could not reach the LM Smart API. The inspection remains stored on this device.';
  }
}
