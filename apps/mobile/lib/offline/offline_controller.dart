import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import 'connectivity_monitor.dart';
import 'models.dart';
import 'photo_store.dart';
import 'sync_service.dart';

class OfflineController extends ChangeNotifier {
  OfflineController({
    OfflineStore? store,
    PhotoStore? photos,
    ConnectivityMonitor? connectivity,
  })  : store = store ?? MemoryOfflineStore(),
        photos = photos ?? MemoryPhotoStore(),
        connectivity = connectivity ?? ConnectivityMonitor();

  final OfflineStore store;
  final PhotoStore photos;
  final ConnectivityMonitor connectivity;
  int pendingCount = 0;
  bool showingCached = false;
  bool syncing = false;
  String? lastSyncMessage;

  SyncService syncer(ApiClient api) => SyncService(api: api, store: store, photos: photos);

  Future<void> start() async {
    await connectivity.start();
    connectivity.addListener(notifyListeners);
  }

  Future<bool> probe(ApiClient api) => connectivity.refreshApi(api);

  Future<void> cacheAssignments({required String officerId, required List<AssignedJob> jobs}) async {
    await store.upsertAssignments(officerId: officerId, jobs: jobs);
    showingCached = false;
    await refreshPending(officerId);
  }

  Future<List<AssignedJob>> cachedAssignments(String officerId) async {
    showingCached = true;
    await refreshPending(officerId);
    return store.assignmentsFor(officerId);
  }

  Future<void> refreshPending(String officerId) async {
    pendingCount = await store.queuedCount(officerId);
    notifyListeners();
  }

  Future<InspectionDraft> ensureDraft({
    required String officerId,
    required AssignedJob job,
  }) async {
    final existing = await store.draftFor(officerId: officerId, applicationId: job.applicationId);
    if (existing != null) return existing;
    final draft = InspectionDraft(
      localId: newLocalId(),
      officerId: officerId,
      applicationId: job.applicationId,
      serverInspectionId: job.inspectionId,
      job: job,
      syncStatus: SyncStatus.pending,
    );
    await store.saveDraft(draft);
    return draft;
  }

  Future<InspectionDraft?> draftFor({required String officerId, required String applicationId}) {
    return store.draftFor(officerId: officerId, applicationId: applicationId);
  }

  Future<Map<String, InspectionDraft>> draftsByApplication(String officerId) async {
    final drafts = await store.draftsFor(officerId);
    return {for (final draft in drafts) draft.applicationId: draft};
  }

  Future<void> persistWorking({
    required InspectionDraft draft,
    required bool locationMismatch,
    double? latitude,
    double? longitude,
    required Map<String, bool> checklist,
    String? remarks,
    String? result,
    String? serverInspectionId,
    bool submitted = false,
  }) async {
    draft
      ..gpsLat = latitude
      ..gpsLng = longitude
      ..locationMismatch = locationMismatch
      ..checklist = Map<String, bool>.from(checklist)
      ..remarks = remarks
      ..result = result;
    if (serverInspectionId != null && !serverInspectionId.startsWith('local:')) {
      draft.serverInspectionId = serverInspectionId;
    }
    if (submitted) {
      draft.submittedLocally = true;
      draft.submittedAt ??= DateTime.now().toUtc();
      draft.syncStatus = SyncStatus.pending;
      draft.syncError = null;
    }
    await store.saveDraft(draft);
    await refreshPending(draft.officerId);
  }

  Future<LocalMeasurement> addLocalMeasurement({
    required InspectionDraft draft,
    required double capacity,
    required double testLoad,
    required double observedValue,
    required double error,
    required double permissibleError,
    required String result,
  }) async {
    final fingerprint = '$capacity|$testLoad|$observedValue|$permissibleError';
    for (final row in draft.measurements) {
      if (row.fingerprint == fingerprint) return row;
    }
    final row = LocalMeasurement(
      localId: newLocalId(),
      capacity: capacity,
      testLoad: testLoad,
      observedValue: observedValue,
      error: error,
      permissibleError: permissibleError,
      result: result,
    );
    draft.measurements.add(row);
    await store.saveDraft(draft);
    return row;
  }

  Future<LocalPhoto> addLocalPhoto({
    required InspectionDraft draft,
    required List<int> bytes,
    required String filename,
    required String kind,
    double? latitude,
    double? longitude,
  }) async {
    final path = await photos.persist(
      officerId: draft.officerId,
      draftId: draft.localId,
      bytes: bytes,
      filename: filename,
    );
    final photo = LocalPhoto(
      localId: newLocalId(),
      kind: kind,
      filename: filename,
      localPath: path,
      latitude: latitude,
      longitude: longitude,
      capturedAt: DateTime.now().toUtc(),
    );
    draft.photos.add(photo);
    await store.saveDraft(draft);
    return photo;
  }

  Future<SyncReport> syncNow({required ApiClient api, required String officerId}) async {
    syncing = true;
    lastSyncMessage = null;
    notifyListeners();
    final reachable = await probe(api);
    if (!reachable) {
      syncing = false;
      lastSyncMessage = 'Sync failed — inspection remains safely stored on this device.';
      notifyListeners();
      return SyncReport(failed: 1, errors: ['LM Smart API is not reachable']);
    }
    final report = await syncer(api).syncOfficer(officerId);
    await refreshPending(officerId);
    syncing = false;
    lastSyncMessage = report.ok
        ? 'Synchronization complete'
        : 'Sync failed — inspection remains safely stored on this device.';
    notifyListeners();
    return report;
  }
}
