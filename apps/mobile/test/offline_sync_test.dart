import 'package:flutter_test/flutter_test.dart';
import 'package:lm_smart/api/api_client.dart';
import 'package:lm_smart/offline/models.dart';
import 'package:lm_smart/offline/offline_controller.dart';
import 'package:lm_smart/offline/photo_store.dart';
import 'package:lm_smart/offline/sync_service.dart';

AssignedJob _job() => AssignedJob.fromJson({
      'id': 'app-1',
      'applicationNumber': 'APP-2026-00001',
      'status': 'ASSIGNED',
      'kind': 'VERIFICATION',
      'inspectionId': null,
      'owner': {'fullName': 'Demo Owner'},
      'business': {'name': 'Demo Mart'},
      'instrument': {
        'instrumentCode': 'LM-1',
        'manufacturer': 'Mettler',
        'model': 'IND425',
        'serialNumber': 'SN-1',
        'capacity': '30 kg',
        'type': {'name': 'Weighing', 'unit': 'kg'},
        'location': {'address': 'MG Road', 'latitude': 12.97, 'longitude': 77.59},
      },
      'schedule': {'scheduledAt': '2026-09-20T10:00:00.000Z'},
    });

InspectionDetail _detail({required String id, int measurements = 0, int photos = 0}) {
  return InspectionDetail(
    id: id,
    applicationId: 'app-1',
    applicationNumber: 'APP-2026-00001',
    measurements: [
      for (var i = 0; i < measurements; i++)
        InspectionMeasurement(
          id: 'm$i',
          testLoad: 10,
          observedValue: 10.02,
          error: 0.02,
          permissibleError: 0.5,
          result: 'PASS',
        ),
    ],
    photos: [
      for (var i = 0; i < photos; i++)
        InspectionPhoto(id: 'p$i', filename: 'shot.jpg', kind: 'INSTRUMENT_FRONT'),
    ],
  );
}

class FakeApi extends ApiClient {
  FakeApi() : super(baseUrl: 'http://test.invalid');

  int starts = 0;
  int updates = 0;
  int measurements = 0;
  int photos = 0;
  int completes = 0;
  bool failCompleteOnce = false;
  bool failStart = false;

  @override
  Future<bool> ping({Duration timeout = const Duration(seconds: 4)}) async => true;

  @override
  Future<InspectionDetail> startInspection(String applicationId) async {
    starts += 1;
    if (failStart) throw ApiException('offline');
    return _detail(id: 'insp-1');
  }

  @override
  Future<InspectionDetail> updateInspection(
    String id, {
    String? remarks,
    bool? locationMismatch,
    double? latitude,
    double? longitude,
    Map<String, bool>? checklist,
  }) async {
    updates += 1;
    return _detail(id: id);
  }

  @override
  Future<InspectionDetail> addMeasurement(
    String id, {
    required double capacity,
    required double testLoad,
    required double observedValue,
    required double permissibleError,
  }) async {
    measurements += 1;
    return _detail(id: id, measurements: measurements);
  }

  @override
  Future<InspectionDetail> uploadPhoto(
    String id, {
    required List<int> bytes,
    required String filename,
    String kind = 'INSTRUMENT_FRONT',
    double? latitude,
    double? longitude,
  }) async {
    photos += 1;
    return _detail(id: id, photos: photos);
  }

  @override
  Future<InspectionDetail> completeInspection(
    String id, {
    required String result,
    String? remarks,
  }) async {
    completes += 1;
    if (failCompleteOnce) {
      failCompleteOnce = false;
      throw ApiException('Inspection is already submitted');
    }
    return _detail(id: id, measurements: 1, photos: 1);
  }
}

void main() {
  test('caches assignments and scopes them to the officer', () async {
    final store = MemoryOfflineStore();
    await store.upsertAssignments(officerId: 'lmo-1', jobs: [_job()]);
    await store.upsertAssignments(officerId: 'lmo-2', jobs: []);
    expect((await store.assignmentsFor('lmo-1')).single.applicationNumber, 'APP-2026-00001');
    expect(await store.assignmentsFor('lmo-2'), isEmpty);
  });

  test('offline submit stays pending and survives reload from the store', () async {
    final controller = OfflineController(store: MemoryOfflineStore(), photos: MemoryPhotoStore());
    final draft = await controller.ensureDraft(officerId: 'lmo-1', job: _job());
    await controller.addLocalMeasurement(
      draft: draft,
      capacity: 30,
      testLoad: 10,
      observedValue: 10.02,
      error: 0.02,
      permissibleError: 0.5,
      result: 'PASS',
    );
    await controller.addLocalPhoto(
      draft: draft,
      bytes: [1, 2, 3],
      filename: 'shot.jpg',
      kind: 'INSTRUMENT_FRONT',
    );
    await controller.persistWorking(
      draft: draft,
      locationMismatch: false,
      latitude: 12.97,
      longitude: 77.59,
      checklist: {'serialNumberMatches': true},
      remarks: 'Field notes',
      result: 'PASS',
      submitted: true,
    );
    final reloaded = await controller.draftFor(officerId: 'lmo-1', applicationId: 'app-1');
    expect(reloaded, isNotNull);
    expect(reloaded!.syncStatus, SyncStatus.pending);
    expect(reloaded.submittedLocally, isTrue);
    expect(reloaded.measurements, hasLength(1));
    expect(reloaded.photos, hasLength(1));
    expect(await controller.store.queuedCount('lmo-1'), 1);
    expect(await controller.store.queuedCount('other'), 0);
  });

  test('sync uploads once then retries without duplicating measurements or photos', () async {
    final store = MemoryOfflineStore();
    final photos = MemoryPhotoStore();
    final api = FakeApi();
    final controller = OfflineController(store: store, photos: photos);
    final draft = await controller.ensureDraft(officerId: 'lmo-1', job: _job());
    await controller.addLocalMeasurement(
      draft: draft,
      capacity: 30,
      testLoad: 10,
      observedValue: 10.02,
      error: 0.02,
      permissibleError: 0.5,
      result: 'PASS',
    );
    await controller.addLocalPhoto(
      draft: draft,
      bytes: [7, 7, 7],
      filename: 'shot.jpg',
      kind: 'INSTRUMENT_FRONT',
    );
    await controller.persistWorking(
      draft: draft,
      locationMismatch: false,
      latitude: 12.97,
      longitude: 77.59,
      checklist: const {},
      remarks: 'ok',
      result: 'PASS',
      submitted: true,
    );

    final sync = SyncService(api: api, store: store, photos: photos);
    await sync.syncOfficer('lmo-1');
    expect(api.starts, 1);
    expect(api.measurements, 1);
    expect(api.photos, 1);
    expect(api.completes, 1);
    expect((await store.draftFor(officerId: 'lmo-1', applicationId: 'app-1'))!.syncStatus, SyncStatus.synced);

    (await store.draftFor(officerId: 'lmo-1', applicationId: 'app-1'))!
      ..syncStatus = SyncStatus.pending
      ..submittedLocally = true;
    await store.saveDraft((await store.draftFor(officerId: 'lmo-1', applicationId: 'app-1'))!);
    api.failCompleteOnce = true;
    await sync.syncOfficer('lmo-1');
    expect(api.measurements, 1);
    expect(api.photos, 1);
    expect(api.completes, 2);
  });
}
