import 'package:flutter_test/flutter_test.dart';
import 'package:lm_smart/api/models.dart';
import 'package:lm_smart/util/geo.dart';
import 'package:lm_smart/util/measurement.dart';

void main() {
  test('error is observed minus test load', () {
    expect(calculatedError(10.2, 10), closeTo(0.2, 0.0001));
    expect(calculatedError(9.7, 10), closeTo(-0.3, 0.0001));
  });

  test('parses assigned job from officer dashboard payload', () {
    final job = AssignedJob.fromJson({
      'id': 'app-1',
      'applicationNumber': 'APP-2026-00001',
      'status': 'ASSIGNED',
      'kind': 'INITIAL',
      'inspectionId': null,
      'owner': {'fullName': 'Demo Owner'},
      'business': {'name': 'Demo Mart'},
      'instrument': {
        'instrumentCode': 'LM-2026-00002',
        'manufacturer': 'Mettler Toledo',
        'model': 'IND425',
        'serialNumber': 'UI-P3-77881',
        'type': {'name': 'Electronic weighing instrument'},
        'location': {'address': 'MG Road', 'city': 'Bengaluru', 'state': 'Karnataka'},
      },
      'schedule': {'scheduledAt': '2026-09-20T10:00:00.000Z'},
    });
    expect(job.businessName, 'Demo Mart');
    expect(job.serialNumber, 'UI-P3-77881');
    expect(job.locationText, contains('Bengaluru'));
    expect(job.scheduledAt, isNotNull);
  });

  test('GPS mismatch uses 250 m prototype threshold', () {
    const instrument = GeoPoint(latitude: 12.9716, longitude: 77.5946);
    const nearby = GeoPoint(latitude: 12.9717, longitude: 77.5947);
    const far = GeoPoint(latitude: 13.0, longitude: 77.6);
    expect(distanceMetres(instrument, nearby) < mismatchThresholdMetres, isTrue);
    expect(distanceMetres(instrument, far) > mismatchThresholdMetres, isTrue);
  });
}
