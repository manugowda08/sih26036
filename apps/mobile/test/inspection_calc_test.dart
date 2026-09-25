import 'package:flutter_test/flutter_test.dart';
import 'package:lm_smart/api/models.dart';
import 'package:lm_smart/config.dart';
import 'package:lm_smart/util/geo.dart';
import 'package:lm_smart/util/measurement.dart';

void main() {
  test('error is observed minus test load', () {
    expect(calculatedError(10.02, 10), closeTo(0.02, 0.0001));
    expect(calculatedError(9.7, 10), closeTo(-0.3, 0.0001));
  });

  test('parses assigned job from officer dashboard payload', () {
    final job = AssignedJob.fromJson({
      'id': 'app-1',
      'applicationNumber': 'APP-2026-00001',
      'status': 'ASSIGNED',
      'kind': 'VERIFICATION',
      'inspectionId': null,
      'owner': {'fullName': 'Demo Owner'},
      'business': {'name': 'Demo Mart'},
      'instrument': {
        'instrumentCode': 'LM-2026-00002',
        'manufacturer': 'Mettler Toledo',
        'model': 'IND425',
        'serialNumber': 'UI-P3-77881',
        'capacity': '30 kg',
        'type': {'name': 'Electronic weighing instrument', 'unit': 'kg'},
        'location': {
          'address': 'MG Road',
          'city': 'Bengaluru',
          'state': 'Karnataka',
          'latitude': 12.9716,
          'longitude': 77.5946,
        },
      },
      'schedule': {'scheduledAt': '2026-09-20T10:00:00.000Z'},
    });
    expect(job.businessName, 'Demo Mart');
    expect(job.serialNumber, 'UI-P3-77881');
    expect(job.capacity, '30 kg');
    expect(job.locationText, contains('Bengaluru'));
    expect(job.instrumentLat, closeTo(12.9716, 0.0001));
    expect(job.scheduledAt, isNotNull);
  });

  test('distance helper reports metres without applying a legal threshold', () {
    const instrument = GeoPoint(latitude: 12.9716, longitude: 77.5946);
    const nearby = GeoPoint(latitude: 12.9717, longitude: 77.5947);
    expect(distanceMetres(instrument, nearby), greaterThan(0));
    expect(distanceMetres(instrument, instrument), 0);
  });

  test('loopback API URLs are detected for physical-phone warnings', () {
    expect(AppConfig.isLoopback('http://127.0.0.1:4000'), isTrue);
    expect(AppConfig.isLoopback('http://localhost:4000'), isTrue);
    expect(AppConfig.isLoopback('http://172.20.10.3:4000'), isFalse);
  });
}
